import { randomBytes } from 'node:crypto';

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class SessionStore<V> {
  private readonly entries = new Map<string, Entry<V>>();

  constructor(private readonly ttlMs: number) {}

  create(value: V): string {
    const id = randomBytes(24).toString('base64url');
    this.entries.set(id, { value, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  get(id: string): V | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry.value;
  }

  delete(id: string): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
