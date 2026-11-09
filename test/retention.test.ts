import { describe, expect, it, vi, beforeEach } from "vitest";
import { MockBackend, KEY, KEY_PREFIX } from "../apps/goldmine-demo/src/services.js";
import { seedState } from "../apps/goldmine-demo/src/data.js";

describe("R9 Personal Data Retention & Phase 2 Data Isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mockStorage: Record<string, string> = {};
    const mockStore = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      }),
      get length() { return Object.keys(mockStorage).length; },
      key: vi.fn((i: number) => Object.keys(mockStorage)[i] || null)
    };
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockStore as unknown as Storage;
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = mockStore as unknown as Storage;
  });

  it("should RETAIN data at 47 hours", () => {
    const defaultLeadsCount = seedState().leads.length;
    const backend = new MockBackend();
    
    // Add a lead
    backend.create({ name: 'Retention Test', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'web', 'hi');
    expect(backend.state.leads.length).toBe(defaultLeadsCount + 1);
    backend.commit();

    // Mock time 47 hours later
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 47 * 60 * 60 * 1000);

    const newBackend = new MockBackend();
    // Should still have the added lead
    expect(newBackend.state.leads.length).toBe(defaultLeadsCount + 1);
    
    vi.useRealTimers();
  });

  it("should EXPIRE data after 49 hours", () => {
    const defaultLeadsCount = seedState().leads.length;
    const backend = new MockBackend();
    
    // Add a lead
    backend.create({ name: 'Expiry Test', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'web', 'hi');
    expect(backend.state.leads.length).toBe(defaultLeadsCount + 1);
    backend.commit();

    // Mock time 49 hours later
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 49 * 60 * 60 * 1000);

    const newBackend = new MockBackend();
    // Should have reverted to seed state (default count)
    expect(newBackend.state.leads.length).toBe(defaultLeadsCount);
    
    vi.useRealTimers();
  });

  it("should REMOVE item from localStorage on expiry", () => {
    const backend = new MockBackend();
    backend.commit();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    // Mock time 49 hours later
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 49 * 60 * 60 * 1000);

    new MockBackend();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith(KEY);

    vi.useRealTimers();
  });

  it("should isolate data by user identifier (Phase 2)", () => {
    const aliceBackend = new MockBackend();
    aliceBackend.login('alice');
    aliceBackend.create({ name: 'Alice Client', athlete: 'self', sport: 'soccer', phone: '555-0101', email: 'alice@x.com' }, 'web', 'Alice inquiry');
    expect(localStorage.getItem(KEY_PREFIX + 'alice')).not.toBeNull();

    const bobBackend = new MockBackend();
    bobBackend.login('bob');
    // Bob should not see Alice's client
    expect(bobBackend.state.leads.some(l => l.firstMessage.includes('Alice inquiry'))).toBe(false);
    bobBackend.create({ name: 'Bob Client', athlete: 'self', sport: 'track', phone: '555-0102', email: 'bob@x.com' }, 'web', 'Bob inquiry');
    expect(localStorage.getItem(KEY_PREFIX + 'bob')).not.toBeNull();

    // Verify Bob's state doesn't affect Alice
    aliceBackend.login('alice');
    expect(aliceBackend.state.leads.some(l => l.firstMessage.includes('Alice inquiry'))).toBe(true);
    expect(aliceBackend.state.leads.some(l => l.firstMessage.includes('Bob inquiry'))).toBe(false);
  });

  it("should purge expired keys across all user prefixes on load", () => {
    const bob = new MockBackend();
    bob.login('bob');
    bob.create({ name: 'Bob Stale', athlete: 'self', sport: 'test', phone: '555-0122', email: 'b@x.com' }, 'web', 'stale lead');
    expect(localStorage.getItem(KEY_PREFIX + 'bob')).not.toBeNull();

    // Fast-forward past 48h
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 50 * 60 * 60 * 1000);

    // Carol logs in
    const carol = new MockBackend();
    carol.login('carol');

    // Bob's expired key should be purged during load
    expect(localStorage.getItem(KEY_PREFIX + 'bob')).toBeNull();

    vi.useRealTimers();
  });
});
