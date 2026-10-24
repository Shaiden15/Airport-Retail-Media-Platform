// Seeded mulberry32 PRNG so every generated airport day is reproducible
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items.at(Math.floor(this.next() * items.length));
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  }

  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item.value;
    }
    const last = items.at(-1);
    if (!last) throw new Error('weighted pick from empty list');
    return last.value;
  }

  // Multiplicative noise around 1, used to keep shares plausible but not identical
  jitter(spread: number): number {
    return 1 + (this.next() * 2 - 1) * spread;
  }

  fork(salt: number): Prng {
    return new Prng(Math.floor(this.next() * 4294967296) ^ salt);
  }
}
