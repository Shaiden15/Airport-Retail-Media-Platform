import { EventEmitter } from 'node:events';

export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

export interface ClockState {
  simTime: string;
  speed: Speed;
  running: boolean;
  dayStart: string;
  dayEnd: string;
}

// One shared simulation time for every role; advanced by real elapsed time times the speed
export class SimClock extends EventEmitter {
  private simMs: number;
  private currentSpeed: Speed;
  private isRunning: boolean;

  constructor(
    private readonly dayStartMs: number,
    private readonly dayEndMs: number,
    startMs: number,
    speed: Speed = 1,
    running = true,
  ) {
    super();
    this.simMs = this.clamp(startMs);
    this.currentSpeed = speed;
    this.isRunning = running;
  }

  private clamp(ms: number): number {
    return Math.min(this.dayEndMs, Math.max(this.dayStartMs, ms));
  }

  nowMs(): number {
    return this.simMs;
  }

  nowIso(): string {
    return new Date(this.simMs).toISOString();
  }

  get speed(): Speed {
    return this.currentSpeed;
  }

  get running(): boolean {
    return this.isRunning;
  }

  state(): ClockState {
    return { simTime: this.nowIso(), speed: this.currentSpeed, running: this.isRunning, dayStart: new Date(this.dayStartMs).toISOString(), dayEnd: new Date(this.dayEndMs).toISOString() };
  }

  advance(realMs: number): number {
    if (!this.isRunning || realMs <= 0) return 0;
    const before = this.simMs;
    this.simMs = this.clamp(this.simMs + realMs * this.currentSpeed);
    if (this.simMs >= this.dayEndMs) this.pause();
    return this.simMs - before;
  }

  play(): void {
    this.isRunning = true;
    this.emit('change', this.state());
  }

  pause(): void {
    this.isRunning = false;
    this.emit('change', this.state());
  }

  setSpeed(speed: Speed): void {
    this.currentSpeed = speed;
    this.emit('change', this.state());
  }

  jump(ms: number): { from: number; to: number } {
    const from = this.simMs;
    this.simMs = this.clamp(ms);
    this.emit('jump', { from, to: this.simMs });
    this.emit('change', this.state());
    return { from, to: this.simMs };
  }
}
