import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import type { FeedHealth } from '../sim/FeedPump.ts';
import type { SimClock } from '../sim/SimClock.ts';
import type { AirportState } from '../state/AirportState.ts';

export const INCIDENT_KINDS = ['screen-offline', 'feed-lag', 'creative-failed', 'manual'] as const;
export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export const INCIDENT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;

export interface Incident {
  id: string;
  kind: (typeof INCIDENT_KINDS)[number];
  subjectId: string;
  title: string;
  severity: (typeof SEVERITIES)[number];
  owner: string | null;
  status: (typeof INCIDENT_STATUSES)[number];
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  notes: string;
}

export const incidentUpdateSchema = z.object({
  owner: z.string().min(2).max(60).nullable().optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  notes: z.string().max(1000).optional(),
});

export const incidentCreateSchema = z.object({
  subjectId: z.string().min(1).max(80),
  title: z.string().min(5).max(140),
  severity: z.enum(SEVERITIES),
  owner: z.string().min(2).max(60).nullable().default(null),
});

const MINUTE = 60_000;
const OFFLINE_ALERT_MINUTES = 5;

type Row = Record<string, unknown>;
const toIncident = (r: Row): Incident => {
  const m = new Map(Object.entries(r));
  const str = (k: string) => String(m.get(k) ?? '');
  const opt = (k: string) => (m.get(k) === null || m.get(k) === undefined ? null : String(m.get(k)));
  return {
    id: str('id'),
    kind: str('kind') as Incident['kind'],
    subjectId: str('subject_id'),
    title: str('title'),
    severity: str('severity') as Incident['severity'],
    owner: opt('owner'),
    status: str('status') as Incident['status'],
    openedAt: str('opened_at'),
    updatedAt: str('updated_at'),
    resolvedAt: opt('resolved_at'),
    notes: str('notes'),
  };
};

// Watches the network and raises incidents automatically; each one resolves itself once the cause clears
export class IncidentService extends EventEmitter {
  private lastCheck = 0;

  constructor(
    private readonly db: Database,
    private readonly state: AirportState,
    private readonly clock: SimClock,
    private readonly vendorOf: (screenId: string) => string,
  ) {
    super();
  }

  private openFor(kind: Incident['kind'], subjectId: string): Incident | null {
    const row = this.db.prepare("SELECT * FROM incidents WHERE kind = ? AND subject_id = ? AND status != 'resolved' ORDER BY opened_at DESC LIMIT 1").get(kind, subjectId);
    return row ? toIncident(row) : null;
  }

  private open(kind: Incident['kind'], subjectId: string, title: string, severity: Incident['severity'], owner: string | null): Incident {
    const now = this.clock.nowIso();
    const incident: Incident = { id: `inc-${Date.now().toString(36)}-${randomInt(36 ** 3).toString(36)}`, kind, subjectId, title, severity, owner, status: 'open', openedAt: now, updatedAt: now, resolvedAt: null, notes: '' };
    this.db.prepare('INSERT INTO incidents (id, kind, subject_id, title, severity, owner, status, opened_at, updated_at, resolved_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(incident.id, kind, subjectId, title, severity, owner, 'open', now, now, null, '');
    this.emit('incident', incident);
    return incident;
  }

  private resolve(incident: Incident, note: string): void {
    const now = this.clock.nowIso();
    this.db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ?, notes = ? WHERE id = ?").run(now, now, incident.notes ? `${incident.notes}\n${note}` : note, incident.id);
    this.emit('incident', { ...incident, status: 'resolved', resolvedAt: now, updatedAt: now });
  }

  // Runs at most once per simulated minute
  evaluate(feeds: readonly FeedHealth[]): void {
    const now = this.clock.nowMs();
    if (Math.abs(now - this.lastCheck) < MINUTE) return;
    this.lastCheck = now;
    const dayStart = Date.parse(`${this.clock.nowIso().slice(0, 10)}T00:00:00Z`);

    for (const screen of this.state.screens.values()) {
      const offlineOpen = this.openFor('screen-offline', screen.id);
      if (screen.status === 'offline') {
        const since = this.state.offlineSince.get(screen.id) ?? dayStart;
        const minutes = (now - since) / MINUTE;
        if (minutes >= OFFLINE_ALERT_MINUTES && !offlineOpen) this.open('screen-offline', screen.id, `${screen.id} offline for more than ${OFFLINE_ALERT_MINUTES} minutes (${screen.name})`, minutes >= 30 ? 'critical' : 'high', this.vendorOf(screen.id));
      } else if (offlineOpen) {
        this.resolve(offlineOpen, 'Auto-resolved: screen back online');
      }
      const creativeOpen = this.openFor('creative-failed', screen.id);
      if (screen.status === 'degraded' && !creativeOpen) this.open('creative-failed', screen.id, `Creative playback errors on ${screen.id} (${screen.name})`, 'medium', this.vendorOf(screen.id));
      if (screen.status === 'online' && creativeOpen) this.resolve(creativeOpen, 'Auto-resolved: playback healthy');
    }

    for (const feed of feeds) {
      const lagOpen = this.openFor('feed-lag', feed.name);
      if (feed.status !== 'ok' && !lagOpen) this.open('feed-lag', feed.name, `${feed.name} feed ${feed.status === 'down' ? 'down' : 'lagging'} (${feed.adapter})`, feed.status === 'down' ? 'critical' : 'high', 'Integration team');
      if (feed.status === 'ok' && lagOpen) this.resolve(lagOpen, 'Auto-resolved: feed delivering again');
    }
  }

  list(filter: { status?: Incident['status'] | 'active'; limit?: number }): Incident[] {
    const limit = Math.min(500, filter.limit ?? 200);
    const rows =
      filter.status === 'active'
        ? this.db.prepare("SELECT * FROM incidents WHERE status != 'resolved' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, opened_at DESC LIMIT ?").all(limit)
        : filter.status
          ? this.db.prepare('SELECT * FROM incidents WHERE status = ? ORDER BY opened_at DESC LIMIT ?').all(filter.status, limit)
          : this.db.prepare('SELECT * FROM incidents ORDER BY opened_at DESC LIMIT ?').all(limit);
    return rows.map(toIncident);
  }

  update(id: string, patch: z.infer<typeof incidentUpdateSchema>): Incident {
    const row = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!row) throw new Error('not-found');
    const current = toIncident(row);
    const next: Incident = {
      ...current,
      owner: patch.owner === undefined ? current.owner : patch.owner,
      status: patch.status ?? current.status,
      severity: patch.severity ?? current.severity,
      notes: patch.notes ?? current.notes,
      updatedAt: this.clock.nowIso(),
      resolvedAt: patch.status === 'resolved' ? this.clock.nowIso() : patch.status ? null : current.resolvedAt,
    };
    this.db.prepare('UPDATE incidents SET owner = ?, status = ?, severity = ?, notes = ?, updated_at = ?, resolved_at = ? WHERE id = ?').run(next.owner, next.status, next.severity, next.notes, next.updatedAt, next.resolvedAt, id);
    this.emit('incident', next);
    return next;
  }

  createManual(input: z.infer<typeof incidentCreateSchema>): Incident {
    return this.open('manual', input.subjectId, input.title, input.severity, input.owner);
  }

  counts(): Record<Incident['severity'], number> {
    const rows = this.db.prepare("SELECT severity, COUNT(*) AS n FROM incidents WHERE status != 'resolved' GROUP BY severity").all();
    const map = new Map(rows.map((r) => [String(r.severity), Number(r.n)]));
    return { critical: map.get('critical') ?? 0, high: map.get('high') ?? 0, medium: map.get('medium') ?? 0, low: map.get('low') ?? 0 };
  }

  reset(): void {
    this.db.exec('DELETE FROM incidents');
    this.lastCheck = 0;
  }
}
