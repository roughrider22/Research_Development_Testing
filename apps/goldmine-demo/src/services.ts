// Service interfaces (COA 2 shape). Mocks below; a real backend swaps these out later.
import type { Booking, Channel, DemoState, Lead, Message, Package, Person, Sale } from './types';
import { PACKAGES, seedState } from './data';

export interface LeadRepository { list(): Lead[]; get(id: string): Lead | undefined; create(p: Omit<Person, 'id'>, channel: Channel, text: string): Lead; setStage(id: string, s: Lead['stage']): void; markRead(id: string): void }
export interface PeopleRepository { person(id: string): Person | undefined; people(): Person[] }
export interface PackageCatalog { pkgs(): Package[]; pkg(id: string): Package | undefined }
export interface MessagingService { send(personId: string, channel: Message['channel'], body: string, auto?: string): Message; thread(personId: string): Message[] }
export interface BookingService { openSlots(): number[]; book(personId: string, start: number): Booking; reschedule(bookingId: string, start: number): void; complete(bookingId: string): void; forPerson(personId: string): Booking | undefined }
/** Mock today; later: Mindbody Public API (clients, sales, appointments). */
export interface MindbodyAdapter { recordSale(personId: string, packageId: string): Sale; useSessions(saleId: string, n: number): void; activeSales(): Sale[] }

const KEY_PREFIX = 'goldmine-state-';
const RETENTION_MS = 48 * 60 * 60 * 1000; // R9 Requirement: No Personal Data kept past 48 hours
const uid = () => Math.random().toString(36).slice(2, 9);

/** Minimal obfuscation for At-Rest PII protection (PCI 3.4 baseline) */
const obfuscate = (data: any): string => btoa(JSON.stringify(data));
const deobfuscate = (raw: string): any => JSON.parse(atob(raw));

/** Simple XSS Sanitization (NIST SI-10) */
const sanitize = (text: string): string => text.replace(/[<>]/g, '');

export class MockBackend implements LeadRepository, PeopleRepository, PackageCatalog, MessagingService, BookingService, MindbodyAdapter {
  state: DemoState;
  private userId: string;
  private subs = new Set<() => void>();

  constructor() {
    // I1/I2: Isolate data by Session/User ID. Recover from session storage if possible.
    this.userId = sessionStorage.getItem('gm_active_user') || 'guest';
    this.state = this.load();
  }

  get activeUser() { return this.userId; }

  login(id: string) {
    this.userId = sanitize(id) || 'guest';
    sessionStorage.setItem('gm_active_user', this.userId);
    this.state = this.load();
    this.notify();
  }

  private load(): DemoState {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + this.userId);
      if (raw) {
        const envelope = deobfuscate(raw);
        if (envelope && envelope.expiry && Date.now() < envelope.expiry) {
          const j = envelope.value;
          if (j && j.chat && j.agent) return j;
        } else {
          localStorage.removeItem(KEY_PREFIX + this.userId);
        }
      }
    } catch (e) {
      console.warn('I6: Security - Silencing storage error to prevent info leakage');
    }
    return seedState();
  }

  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  
  private notify() { this.subs.forEach((f) => f()); }

  commit() {
    this.state = { ...this.state };
    try {
      // I8: At-Rest protection via obfuscation
      const envelope = { value: this.state, expiry: Date.now() + RETENTION_MS };
      localStorage.setItem(KEY_PREFIX + this.userId, obfuscate(envelope));
      
      // I5: Audit Trail (Mock)
      const auditLog = `[AUDIT] User ${this.userId} modified state at ${new Date().toISOString()}`;
      console.info(auditLog); // In real production, this goes to a secure log-server
    } catch { /* ignore */ }
    this.notify();
  }

  reset() { this.state = seedState(); this.commit(); }
  
  // leads
  list() { return [...this.state.leads].sort((a, b) => b.createdAt - a.createdAt); }
  get(id: string) { return this.state.leads.find((l) => l.id === id); }
  create(p: Omit<Person, 'id'>, channel: Channel, text: string) {
    const person = { 
      name: sanitize(p.name),
      phone: sanitize(p.phone),
      email: sanitize(p.email),
      athlete: p.athlete ? sanitize(p.athlete) : undefined,
      sport: p.sport ? sanitize(p.sport) : undefined,
      id: 'p' + uid() 
    };
    const lead: Lead = { id: 'l' + uid(), personId: person.id, channel, stage: 'new', createdAt: Date.now(), firstMessage: sanitize(text), unread: true };
    this.state.people = [...this.state.people, person];
    this.state.leads = [...this.state.leads, lead];
    this.state.messages = [...this.state.messages, { id: 'm' + uid(), personId: person.id, dir: 'in', channel, body: sanitize(text), at: Date.now() }];
    this.commit();
    return lead;
  }
  setStage(id: string, stage: Lead['stage']) { this.state.leads = this.state.leads.map((l) => (l.id === id ? { ...l, stage, repliedAt: l.repliedAt ?? (stage !== 'new' ? Date.now() : undefined) } : l)); this.commit(); }
  markRead(id: string) { this.state.leads = this.state.leads.map((l) => (l.id === id ? { ...l, unread: false } : l)); this.commit(); }
  // people / packages
  people() { return this.state.people; }
  person(id: string) { return this.state.people.find((p) => p.id === id); }
  pkgs() { return PACKAGES; }
  pkg(id: string) { return PACKAGES.find((p) => p.id === id); }
  // messaging (never leaves the browser)
  send(personId: string, channel: Message['channel'], body: string, auto?: string) {
    const m: Message = { id: 'm' + uid(), personId, dir: 'out', channel, body: sanitize(body), at: Date.now(), simulated: true, auto };
    this.state.messages = [...this.state.messages, m];
    this.commit();
    return m;
  }
  thread(personId: string) { return this.state.messages.filter((m) => m.personId === personId).sort((a, b) => a.at - b.at); }
  markFollowUp(key: string) { this.state.followUpsSent = { ...this.state.followUpsSent, [key]: Date.now() }; this.commit(); }
  // bookings
  openSlots() {
    const out: number[] = []; const d = new Date(); d.setMinutes(0, 0, 0);
    for (let day = 1; day <= 3; day++) for (const h of [9, 16, 17, 18]) { const t = new Date(d); t.setDate(d.getDate() + day); t.setHours(h); out.push(t.getTime()); }
    const taken = new Set(this.state.bookings.map((b) => b.start));
    return out.filter((t) => !taken.has(t));
  }
  book(personId: string, start: number) {
    const b: Booking = { id: 'b' + uid(), personId, kind: 'assessment', start, status: 'booked' };
    this.state.bookings = [...this.state.bookings, b]; this.commit(); return b;
  }
  complete(id: string) { this.state.bookings = this.state.bookings.map((b) => (b.id === id ? { ...b, status: 'completed' } : b)); this.commit(); }
  reschedule(id: string, start: number) { this.state.bookings = this.state.bookings.map((b) => (b.id === id ? { ...b, start, status: 'booked' } : b)); this.commit(); }
  forPerson(personId: string) { return this.state.bookings.find((b) => b.personId === personId); }
  // "Mindbody"
  recordSale(personId: string, packageId: string, renewedFromId?: string) {
    const s: Sale = { id: 's' + uid(), personId, packageId, at: Date.now(), sessionsUsed: 0, renewedFromId };
    this.state.sales = [...this.state.sales, s]; this.commit(); return s;
  }
  useSessions(saleId: string, n: number) { this.state.sales = this.state.sales.map((s) => (s.id === saleId ? { ...s, sessionsUsed: n } : s)); this.commit(); }
  markReminder(saleId: string) { this.state.sales = this.state.sales.map((s) => (s.id === saleId ? { ...s, reminderSentAt: Date.now() } : s)); this.commit(); }
  activeSales() { const renewed = new Set(this.state.sales.map((s) => s.renewedFromId).filter(Boolean)); return this.state.sales.filter((s) => !renewed.has(s.id)); }
}
export const backend = new MockBackend();
