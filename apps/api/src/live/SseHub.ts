import type { ServerResponse } from 'node:http';

export const TOPICS = ['clock', 'flight', 'decision', 'presence', 'kpi', 'feed', 'screen', 'redemption', 'inject', 'incident'] as const;
export type Topic = (typeof TOPICS)[number];

interface Client {
  id: number;
  res: ServerResponse;
  topics: ReadonlySet<Topic>;
}

// Server-Sent Events fan-out; throttled topics send only the latest value at most once per interval
export class SseHub {
  private readonly clients = new Map<number, Client>();
  private readonly latest = new Map<Topic, unknown>();
  private readonly lastSent = new Map<Topic, number>();
  private readonly dirty = new Set<Topic>();
  private nextId = 1;
  private heartbeat: NodeJS.Timeout | null = null;
  sent = 0;

  constructor(private readonly throttleMs: ReadonlyMap<Topic, number>) {}

  start(): void {
    let ticks = 0;
    this.heartbeat = setInterval(() => {
      // Comment line every 15 s keeps proxies on free hosts from closing idle streams
      if (++ticks % 60 === 0) for (const c of this.clients.values()) c.res.write(': keep-alive\n\n');
      this.flushThrottled();
    }, 250);
    this.heartbeat.unref();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.clients.values()) c.res.end();
    this.clients.clear();
  }

  get size(): number {
    return this.clients.size;
  }

  add(res: ServerResponse, topics: ReadonlySet<Topic>): () => void {
    const id = this.nextId++;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 2000\n\n');
    this.clients.set(id, { id, res, topics });
    for (const [topic, data] of this.latest) if (topics.has(topic)) this.write(res, topic, data);
    return () => this.clients.delete(id);
  }

  private write(res: ServerResponse, topic: Topic, data: unknown): void {
    res.write(`event: ${topic}\ndata: ${JSON.stringify(data)}\n\n`);
    this.sent++;
  }

  // Lets callers skip building an expensive payload that would be throttled anyway
  due(topic: Topic): boolean {
    return Date.now() - (this.lastSent.get(topic) ?? 0) >= (this.throttleMs.get(topic) ?? 0);
  }

  publish(topic: Topic, data: unknown): void {
    this.latest.set(topic, data);
    const interval = this.throttleMs.get(topic) ?? 0;
    const now = Date.now();
    if (interval > 0 && now - (this.lastSent.get(topic) ?? 0) < interval) {
      this.dirty.add(topic);
      return;
    }
    this.send(topic, data, now);
  }

  private send(topic: Topic, data: unknown, now: number): void {
    this.lastSent.set(topic, now);
    this.dirty.delete(topic);
    for (const c of this.clients.values()) if (c.topics.has(topic)) this.write(c.res, topic, data);
  }

  // Delivers any throttled value that has been waiting longer than its interval
  flushThrottled(): void {
    const now = Date.now();
    for (const topic of [...this.dirty]) {
      const interval = this.throttleMs.get(topic) ?? 0;
      if (now - (this.lastSent.get(topic) ?? 0) >= interval) this.send(topic, this.latest.get(topic), now);
    }
  }
}
