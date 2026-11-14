import { describe, expect, it, vi, beforeEach } from "vitest";
import { MockBackend, KEY, KEY_PREFIX } from "../apps/goldmine-demo/src/services.js";
import { seedState } from "../apps/goldmine-demo/src/data.js";

function createMockStore(): Storage {
  const mockStorage: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => mockStorage[key] || null),
    setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => {
      for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    }),
    get length() { return Object.keys(mockStorage).length; },
    key: vi.fn((i: number) => Object.keys(mockStorage)[i] || null)
  } as unknown as Storage;
}

describe("R9 Personal Data Retention & Phase 2 Data Isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMockStore();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = createMockStore();
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

  it("should not reset expiry window on subsequent commits (no indefinite retention)", () => {
    const backend = new MockBackend();
    backend.create({ name: 'Hot Lead', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'web', 'msg1');
    backend.commit();

    // Advance 40 hours
    vi.useFakeTimers();
    const startTime = Date.now();
    vi.setSystemTime(startTime + 40 * 60 * 60 * 1000);

    // Modify state at 40h mark and commit
    const activeBackend = new MockBackend();
    activeBackend.create({ name: 'Hot Lead 2', athlete: 'self', sport: 'test', phone: '456', email: 'c@d.com' }, 'web', 'msg2');
    activeBackend.commit();

    // Advance to 49 hours from start (only 9 hours after second commit)
    vi.setSystemTime(startTime + 49 * 60 * 60 * 1000);

    // After 49 hours from original creation, data should expire (not postponed by commit at 40h)
    const laterBackend = new MockBackend();
    expect(laterBackend.state.people.some(p => p.name === 'Hot Lead')).toBe(false);
    expect(laterBackend.state.leads.some(l => l.firstMessage === 'msg1')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();

    vi.useRealTimers();
  });

  it("should start a fresh expiry window on reset and not reuse old stored expiry", () => {
    vi.useFakeTimers();
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    const backend = new MockBackend();
    backend.create({ name: 'Initial Lead', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'web', 'msg1');
    backend.commit();

    // Advance 40 hours into the initial 48h retention window
    vi.setSystemTime(startTime + 40 * 60 * 60 * 1000);

    // Reset state: must start a fresh 48h window from now (startTime + 40h)
    const activeBackend = new MockBackend();
    activeBackend.reset();

    // Advance to 50 hours from start (10h after reset, but 2h past original expiry)
    vi.setSystemTime(startTime + 50 * 60 * 60 * 1000);

    // The data should NOT have expired under the old window
    const postResetBackend = new MockBackend();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(postResetBackend.state.leads.length).toBe(seedState().leads.length);

    // Advance past the new expiry window (40h + 49h = 89h from start)
    vi.setSystemTime(startTime + 90 * 60 * 60 * 1000);

    const expiredBackend = new MockBackend();
    expect(expiredBackend.state.people.some(p => p.name === 'Initial Lead')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();

    vi.useRealTimers();
  });
});
