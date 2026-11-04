import { describe, expect, it, vi, beforeEach } from "vitest";
import { MockBackend } from "../apps/goldmine-demo/src/services";
import { seedState } from "../apps/goldmine-demo/src/data";

describe("R9 Personal Data Retention", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mockStorage: Record<string, string> = {};
    global.localStorage = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => {}),
      length: 0,
      key: vi.fn(() => null)
    } as unknown as Storage;
  });

  it("should RETAIN data at 47 hours", () => {
    const defaultLeadsCount = seedState().leads.length;
    const backend = new MockBackend();
    
    // Add a lead
    backend.create({ name: 'Retention Test', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'sms', 'hi');
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
    backend.create({ name: 'Expiry Test', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'sms', 'hi');
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
});
