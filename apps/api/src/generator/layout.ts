import type { Point } from '@dwellcast/shared';

// Stylised two-terminal floor plan in SVG units (1 unit = 1.5 m); gate names follow the sample AODB file

export const METRES_PER_UNIT = 1.5;
export const PLAN_SIZE = { width: 1600, height: 900 } as const;

export interface LayoutTerminal { id: string; code: string; name: string; bounds: { x: number; y: number; w: number; h: number } }
export interface LayoutConcourse { id: string; code: string; name: string; terminalId: string }
export interface LayoutZone { id: string; name: string; terminalId: string; concourseId: string | null; kind: 'gate-area' | 'retail' | 'security' | 'landside'; airside: boolean; centroid: Point; radius: number }
export interface LayoutGate { id: string; terminalId: string; concourseId: string; zoneId: string; position: Point; bus: boolean }
export interface LayoutCheckpoint { id: string; name: string; terminalId: string; zoneId: string; kind: 'security' | 'passport' | 'boarding' }
export interface LayoutQueue { id: string; name: string; checkpointId: string; zoneId: string; capacityPerHour: number }

export interface AirportLayout {
  terminals: LayoutTerminal[];
  concourses: LayoutConcourse[];
  zones: LayoutZone[];
  gates: LayoutGate[];
  checkpoints: LayoutCheckpoint[];
  queues: LayoutQueue[];
  stands: { contact: string[]; remote: string[]; apron: string[] };
}

interface PierSpec {
  concourse: LayoutConcourse;
  gates: string[];
  start: Point;
  end: Point;
  zoneSize: number;
  zonePrefix: string;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
}

function range(prefix: string, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
}

export function buildLayout(): AirportLayout {
  const terminals: LayoutTerminal[] = [
    { id: 'T1', code: 'T1', name: 'Terminal 1 (Domestic)', bounds: { x: 60, y: 120, w: 560, h: 660 } },
    { id: 'T2', code: 'T2', name: 'Terminal 2 (International)', bounds: { x: 680, y: 60, w: 860, h: 780 } },
  ];

  const concourses: LayoutConcourse[] = [
    { id: 'T1-A', code: 'A', name: 'Concourse A', terminalId: 'T1' },
    { id: 'T1-B', code: 'B', name: 'Concourse B', terminalId: 'T1' },
    { id: 'T1-C', code: 'C', name: 'Concourse C', terminalId: 'T1' },
    { id: 'T2-N', code: 'N', name: 'North Pier', terminalId: 'T2' },
    { id: 'T2-M', code: 'M', name: 'Central Pier', terminalId: 'T2' },
    { id: 'T2-S', code: 'S', name: 'South Pier', terminalId: 'T2' },
  ];
  const concourse = new Map(concourses.map((c) => [c.id, c]));
  const need = (id: string): LayoutConcourse => {
    const found = concourse.get(id);
    if (!found) throw new Error(`unknown concourse ${id}`);
    return found;
  };

  const piers: PierSpec[] = [
    { concourse: need('T1-A'), gates: range('A', 1, 9), start: { x: 200, y: 330 }, end: { x: 580, y: 160 }, zoneSize: 5, zonePrefix: 'T1 Concourse A' },
    { concourse: need('T1-B'), gates: range('B', 1, 11), start: { x: 200, y: 520 }, end: { x: 590, y: 520 }, zoneSize: 6, zonePrefix: 'T1 Concourse B' },
    { concourse: need('T1-C'), gates: range('C', 1, 10), start: { x: 200, y: 700 }, end: { x: 580, y: 760 }, zoneSize: 5, zonePrefix: 'T1 Concourse C' },
    { concourse: need('T2-N'), gates: range('', 41, 56), start: { x: 900, y: 300 }, end: { x: 1500, y: 110 }, zoneSize: 6, zonePrefix: 'T2 North' },
    { concourse: need('T2-M'), gates: range('', 57, 72), start: { x: 900, y: 450 }, end: { x: 1510, y: 450 }, zoneSize: 6, zonePrefix: 'T2 Central' },
    { concourse: need('T2-S'), gates: range('', 73, 88), start: { x: 900, y: 600 }, end: { x: 1500, y: 790 }, zoneSize: 6, zonePrefix: 'T2 South' },
  ];

  const zones: LayoutZone[] = [];
  const gates: LayoutGate[] = [];

  for (const pier of piers) {
    const count = pier.gates.length;
    for (let start = 0; start < count; start += pier.zoneSize) {
      const chunk = pier.gates.slice(start, start + pier.zoneSize);
      const first = chunk.at(0) ?? '';
      const last = chunk.at(-1) ?? '';
      const zoneId = `Z-${pier.concourse.id}-${first}`;
      const mid = lerp(pier.start, pier.end, (start + chunk.length / 2) / count);
      zones.push({ id: zoneId, name: `${pier.zonePrefix} Gates ${first}-${last}`, terminalId: pier.concourse.terminalId, concourseId: pier.concourse.id, kind: 'gate-area', airside: true, centroid: mid, radius: 70 });
      chunk.forEach((gate, i) => {
        const along = lerp(pier.start, pier.end, (start + i + 0.5) / count);
        const side = i % 2 === 0 ? -24 : 24;
        gates.push({ id: gate, terminalId: pier.concourse.terminalId, concourseId: pier.concourse.id, zoneId, position: { x: along.x, y: along.y + side }, bus: false });
      });
    }
  }

  zones.push(
    { id: 'Z-T1-LAND', name: 'T1 Check-in Hall', terminalId: 'T1', concourseId: null, kind: 'landside', airside: false, centroid: { x: 110, y: 450 }, radius: 60 },
    { id: 'Z-T1-SEC', name: 'T1 Security', terminalId: 'T1', concourseId: null, kind: 'security', airside: false, centroid: { x: 150, y: 450 }, radius: 35 },
    { id: 'Z-T1-PLAZA', name: 'T1 Market Plaza', terminalId: 'T1', concourseId: null, kind: 'retail', airside: true, centroid: { x: 220, y: 450 }, radius: 60 },
    { id: 'Z-T2-LAND', name: 'T2 Check-in Hall', terminalId: 'T2', concourseId: null, kind: 'landside', airside: false, centroid: { x: 720, y: 450 }, radius: 60 },
    { id: 'Z-T2-SEC', name: 'T2 Security and Passport Control', terminalId: 'T2', concourseId: null, kind: 'security', airside: false, centroid: { x: 770, y: 450 }, radius: 40 },
    { id: 'Z-T2-DUTYFREE', name: 'T2 Duty Free Walkthrough', terminalId: 'T2', concourseId: null, kind: 'retail', airside: true, centroid: { x: 830, y: 450 }, radius: 55 },
    { id: 'Z-T2-PLAZA', name: 'T2 Grand Plaza', terminalId: 'T2', concourseId: null, kind: 'retail', airside: true, centroid: { x: 880, y: 380 }, radius: 70 },
  );

  // Bus gates sit on the lower level next to the gate rooms that feed remote stands
  const busGates: [string, string, Point][] = [
    ['BUS1', 'Z-T1-A-A1', { x: 230, y: 360 }],
    ['BUS2', 'Z-T1-B-B1', { x: 230, y: 545 }],
    ['BUS3', 'Z-T1-B-B7', { x: 520, y: 545 }],
    ['BUS4', 'Z-T1-C-C1', { x: 230, y: 725 }],
    ['BUS5', 'Z-T2-N-41', { x: 930, y: 325 }],
    ['BUS6', 'Z-T2-M-57', { x: 930, y: 475 }],
    ['BUS7', 'Z-T2-S-73', { x: 930, y: 625 }],
    ['BUS8', 'Z-T2-M-63', { x: 1150, y: 475 }],
  ];
  for (const [id, zoneId, position] of busGates) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone || !zone.concourseId) throw new Error(`bus gate ${id} has no zone`);
    gates.push({ id, terminalId: zone.terminalId, concourseId: zone.concourseId, zoneId, position, bus: true });
  }

  const checkpoints: LayoutCheckpoint[] = [
    { id: 'CP-T1-SEC', name: 'T1 Central Security', terminalId: 'T1', zoneId: 'Z-T1-SEC', kind: 'security' },
    { id: 'CP-T2-SEC', name: 'T2 Central Security', terminalId: 'T2', zoneId: 'Z-T2-SEC', kind: 'security' },
    { id: 'CP-T2-PASS', name: 'T2 Outbound Passport Control', terminalId: 'T2', zoneId: 'Z-T2-SEC', kind: 'passport' },
  ];

  const queues: LayoutQueue[] = [
    { id: 'Q-T1-SEC-STD', name: 'T1 Security Standard', checkpointId: 'CP-T1-SEC', zoneId: 'Z-T1-SEC', capacityPerHour: 1400 },
    { id: 'Q-T1-SEC-FAST', name: 'T1 Security Fast Track', checkpointId: 'CP-T1-SEC', zoneId: 'Z-T1-SEC', capacityPerHour: 300 },
    { id: 'Q-T2-SEC-STD', name: 'T2 Security Standard', checkpointId: 'CP-T2-SEC', zoneId: 'Z-T2-SEC', capacityPerHour: 1600 },
    { id: 'Q-T2-SEC-FAST', name: 'T2 Security Fast Track', checkpointId: 'CP-T2-SEC', zoneId: 'Z-T2-SEC', capacityPerHour: 350 },
    { id: 'Q-T2-PASS-ALL', name: 'T2 Passport Control', checkpointId: 'CP-T2-PASS', zoneId: 'Z-T2-SEC', capacityPerHour: 1200 },
  ];

  return {
    terminals,
    concourses,
    zones,
    gates,
    checkpoints,
    queues,
    stands: { contact: range('C', 1, 40), remote: range('R', 1, 22), apron: range('V', 1, 29) },
  };
}

export function distanceMetres(a: Point, b: Point): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * METRES_PER_UNIT);
}
