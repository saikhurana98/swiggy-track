import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../src/session-store.js';

describe('SessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a session and returns its id and value', () => {
    const store = new SessionStore<{ phone: string }>(60_000);
    const id = store.create({ phone: '9876543210' });
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(store.get(id)?.phone).toBe('9876543210');
  });

  it('returns undefined for unknown session id', () => {
    const store = new SessionStore<{ phone: string }>(60_000);
    expect(store.get('does-not-exist')).toBeUndefined();
  });

  it('expires sessions after TTL', () => {
    const store = new SessionStore<{ phone: string }>(1_000);
    const id = store.create({ phone: '9876543210' });
    expect(store.get(id)).toBeDefined();
    vi.advanceTimersByTime(1_001);
    expect(store.get(id)).toBeUndefined();
  });

  it('deletes sessions explicitly', () => {
    const store = new SessionStore<{ phone: string }>(60_000);
    const id = store.create({ phone: '9876543210' });
    store.delete(id);
    expect(store.get(id)).toBeUndefined();
  });

  it('issues unique session ids', () => {
    const store = new SessionStore<{ phone: string }>(60_000);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      ids.add(store.create({ phone: '9876543210' }));
    }
    expect(ids.size).toBe(100);
  });

  it('reports size and supports clearing all entries', () => {
    const store = new SessionStore<{ phone: string }>(60_000);
    store.create({ phone: '9876543210' });
    store.create({ phone: '9876543211' });
    expect(store.size).toBe(2);
    store.clear();
    expect(store.size).toBe(0);
  });
});
