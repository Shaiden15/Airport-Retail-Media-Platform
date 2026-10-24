import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Runtime } from './Runtime.ts';
import { createTestRuntime } from '../testRuntime.ts';

let rt: Runtime;
let gate42Screen = '';
let xh501 = '';

beforeAll(async () => {
  rt = await createTestRuntime();
  gate42Screen = rt.screenClosestToGate('42')?.id ?? '';
  xh501 = [...rt.state.flights.values()].find((f) => f.airlineCode === 'XH' && f.flightNumber === '501' && f.direction === 'departure')?.id ?? '';
});

afterAll(() => rt.stop());

describe('worked example: Gate 42 at 14:10', () => {
  it('plays the duty-free perfume offer with the 1.5 delay boost from XH501', () => {
    rt.jump(rt.resolveTime('14:10'));
    const d = rt.engine.latest(gate42Screen);
    expect(d?.winner?.campaignId).toBe('cmp-perfume-15');
    const perfume = d?.candidates.find((c) => c.campaignId === 'cmp-perfume-15');
    expect(perfume?.breakdown?.boost).toBe(1.5);
    expect(perfume?.triggers.some((t) => t.kind === 'delay' && t.flightId === xh501)).toBe(true);
    expect(d?.winningRule).toContain('XH501 delayed 45 min');
  });

  it('ranks toys below perfume and filters the lounge pass to other gates by placement', () => {
    const d = rt.engine.latest(gate42Screen);
    const score = (id: string) => d?.candidates.find((c) => c.campaignId === id)?.breakdown?.score ?? -1;
    expect(score('cmp-toys-b2g1')).toBeGreaterThan(0);
    expect(score('cmp-toys-b2g1')).toBeLessThan(score('cmp-perfume-15'));
    expect(d?.candidates.find((c) => c.campaignId === 'cmp-lounge-daypass')).toMatchObject({ status: 'filtered', reason: 'placement' });
  });

  it('builds the crowd from the worked-example flights with aggregated shares', () => {
    const d = rt.engine.latest(gate42Screen);
    const labels = d?.crowd.flights.map((f) => f.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(['XH501', 'XD881', 'YA233']));
    expect(d?.crowd.internationalShare).toBeGreaterThan(0.4);
    expect(d?.crowd.medianDwellMinutes).toBeGreaterThan(10);
    expect(d?.crowd.tripPurpose.holiday).toBeGreaterThan(d?.crowd.tripPurpose.business ?? 1);
  });

  it('executes only after the deterministic checks pass, and logs the evidence trail', () => {
    const d = rt.engine.latest(gate42Screen);
    expect(d?.source).toBe('agent-verified');
    expect(d?.agent.validation?.checks.every((c) => c.passed)).toBe(true);
    expect(d?.evidence.some((e) => e.kind === 'flight' && e.subjectId === xh501)).toBe(true);
    expect(d?.agent.proposal?.citedEvidence.every((id) => d.evidence.some((e) => e.id === id))).toBe(true);
  });

  it('is reproducible: the same moment gives the same audience match, boosts, filters and winner', () => {
    // Final scores also carry budget pacing, which depends on spend so far; the validator re-derives those from logged inputs
    const view = () => {
      const d = rt.engine.latest(gate42Screen);
      return { winner: d?.winner?.campaignId, rows: d?.candidates.map((c) => [c.campaignId, c.breakdown?.match ?? null, c.breakdown?.boost ?? null, c.reason]).sort() };
    };
    const first = view();
    rt.jump(rt.resolveTime('14:10'));
    expect(view()).toEqual(first);
  });
});

describe('live cause and effect', () => {
  it('an injected AIDX delay re-plans gate screens within 2 seconds and pushes the goodwill voucher', () => {
    rt.jump(rt.resolveTime('14:10'));
    const started = performance.now();
    const result = rt.injectDelay(xh501, 75);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result.latencyMs).toBeLessThan(2000);
    expect(result.aidxXml).toContain('<PublicStatus>DLY</PublicStatus>');
    expect(result.affectedScreens).toContain(gate42Screen);
    const d = rt.engine.latest(gate42Screen);
    expect(d?.source).toBe('delay-goodwill');
    expect(d?.winner?.campaignId).toBe('cmp-coffee-goodwill');
    expect(rt.state.flights.get(xh501)).toMatchObject({ status: 'delayed', delayMinutes: 75 });
  });

  it('raises the passenger count in the zone when a delay holds passengers at the gate', () => {
    rt.jump(rt.resolveTime('15:15'));
    // Back to the planned 45-minute delay: at 15:15 XH501 passengers are boarding and leaving the zone
    rt.injectDelay(xh501, 45);
    const before = rt.presence.zone('Z-T2-N-41', rt.clock.nowMs())?.pax ?? 0;
    rt.injectDelay(xh501, 100);
    const after = rt.presence.zone('Z-T2-N-41', rt.clock.nowMs())?.pax ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('jumping back in time replays the day, so later injections are back in the future', () => {
    rt.jump(rt.resolveTime('14:05'));
    expect(rt.state.flights.get(xh501)?.delayMinutes).toBe(45);
  });

  it('a gate change moves the flight and later feed messages keep the new gate', () => {
    rt.jump(rt.resolveTime('12:00'));
    const flight = [...rt.state.flights.values()].find((f) => f.direction === 'departure' && f.terminalId === 'T2' && f.gate && !f.gate.startsWith('BUS') && Date.parse(f.scheduledTime) > rt.clock.nowMs() + 90 * 60_000);
    expect(flight).toBeDefined();
    if (!flight) return;
    const target = flight.gate === '88' ? '87' : '88';
    const result = rt.injectGateChange(flight.id, target);
    expect(rt.state.flights.get(flight.id)?.gate).toBe(target);
    expect(result.affectedScreens.length).toBeGreaterThan(0);
    rt.jump(Date.parse(flight.estimatedTime ?? flight.scheduledTime) - 30 * 60_000);
    expect(rt.state.flights.get(flight.id)?.gate).toBe(target);
  });

  it('an offline screen stops getting decisions and lowers screens online', () => {
    rt.jump(rt.resolveTime('14:10'));
    const before = rt.kpis().screensOnline;
    rt.setScreenStatus(gate42Screen, 'offline');
    expect(rt.kpis().screensOnline).toBe(before - 1);
    rt.control({ action: 'play' });
    rt.tick(15_000);
    rt.control({ action: 'pause' });
    expect(rt.engine.latest(gate42Screen)?.simTime).not.toBe(rt.clock.nowIso());
    rt.setScreenStatus(gate42Screen, 'online');
  });

  it('a hallucinated AI proposal is rejected and the screen falls back to the rule-based choice', () => {
    // 14:09 is before the earlier test's live delay injection, so the normal perfume decision applies
    rt.jump(Date.parse(`${rt.airport.operatingDate}T14:09:00Z`));
    const result = rt.injectHallucination(gate42Screen);
    const d = rt.engine.latest(gate42Screen);
    expect(result.decisions[0]?.source).toBe('rule-based');
    expect(d?.agent.validation?.accepted).toBe(false);
    expect(d?.agent.validation?.checks.find((c) => c.name === 'evidence-exists')?.passed).toBe(false);
    expect(d?.winningRule).toContain('AI proposal rejected');
    expect(d?.winner?.campaignId).toBe('cmp-perfume-15');
  });
});

describe('performance at 60x', () => {
  it('runs two simulated hours with every tick inside the 250 ms budget', () => {
    rt.jump(rt.resolveTime('16:00'));
    rt.control({ action: 'speed', speed: 60 });
    rt.control({ action: 'play' });
    let worst = 0;
    let total = 0;
    for (let i = 0; i < 480; i++) {
      rt.tick(250);
      worst = Math.max(worst, rt.lastTickMs);
      total += rt.lastTickMs;
    }
    rt.control({ action: 'pause' });
    expect(rt.clock.nowIso()).toBe(`${rt.airport.operatingDate}T18:00:00.000Z`);
    expect(total / 480).toBeLessThan(100);
    expect(worst).toBeLessThan(250);
    expect(rt.kpis().playsToday).toBeGreaterThan(50_000);
  }, 60_000);
});
