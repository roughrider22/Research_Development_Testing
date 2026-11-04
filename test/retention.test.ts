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

  it("should expire data after the retention period", () => {
    const defaultLeadsCount = seedState().leads.length;
    const backend = new MockBackend();
    
    // Add a lead
    backend.create({ name: 'Test', athlete: 'self', sport: 'test', phone: '123', email: 'a@b.com' }, 'sms', 'hi');
    expect(backend.state.leads.length).toBe(defaultLeadsCount + 1);
    backend.commit();

    // Verify it's in storage
    expect(localStorage.setItem).toHaveBeenCalled();

    // Mock time 31 days later
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

    const newBackend = new MockBackend();
    // Should have reverted to seed state (default count)
    expect(newBackend.state.leads.length).toBe(defaultLeadsCount);
    
    vi.useRealTimers();
  });
});
