// Fictional sample people only. Package names/prices from goldmineperformance.com/prices (read 2026-11-02).
import type { DemoState, Package, Person, Lead, Message, Booking, Sale, Channel, Stage } from './types';

const priv = (min: number, rows: [number, number][]): Package[] =>
  rows.map(([n, price]) => ({ id: `pv${min}-${n}`, category: `Private · ${min} min`, name: `Private ${min}-Minute · ${n} Session${n > 1 ? 's' : ''}`, sessions: n, price }));
const semi = (min: number, rows: [number, number][]): Package[] =>
  rows.map(([n, price]) => ({ id: `sp${min}-${n}`, category: `Semi-Private · ${min} min (2 athletes)`, name: `Semi-Private ${min}-Minute · ${n} Session${n > 1 ? 's' : ''} (2 athletes)`, sessions: n, price, perPerson: true }));

export const PACKAGES: Package[] = [
  ...priv(30, [[1, 45], [5, 200], [10, 350]]),
  ...priv(60, [[1, 90], [5, 375], [10, 700]]),
  ...priv(90, [[1, 100], [5, 475], [10, 900]]),
  ...priv(120, [[1, 145], [5, 700], [10, 1350]]),
  ...semi(60, [[1, 60], [5, 275], [10, 500]]),
];

const H = 3600e3, D = 24 * H;
export function seedState(): DemoState {
  const now = Date.now();
  const people: Person[] = [
    ['Tasha Monroe', 'Kai (12)', 'baseball', 'phone'],
    ['Derrick Hale', 'Jaylen (16)', 'football', 'instagram'],
    ['Priya Nandakumar', 'Anika (13)', 'volleyball', 'web'],
    ['Marcus Bell', 'self', 'general strength', 'phone'],
    ['Lauren Ochoa', 'Sofia (15)', 'soccer', 'instagram'],
    ['Ben Whitaker', 'Cole (17)', 'basketball', 'web'],
    ['Renee Castillo', 'Mateo (11)', 'baseball', 'web'],
    ['Andre Simmons', 'Zion (14)', 'track', 'instagram'],
    ['Holly Brandt', 'Ella (16)', 'softball', 'web'],
    ['Grant Foley', 'Tyler (15)', 'football', 'phone'],
  ].map(([name, athlete, sport], i) => ({ id: 'seed' + i, name, athlete, sport, phone: `(555) 01${String(i).padStart(2, '0')}-${2000 + i * 37}`, email: name.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com' }));
  const ch = (i: number) => (['phone', 'instagram', 'web', 'phone', 'instagram', 'web', 'web', 'instagram', 'web', 'phone'][i] as Channel);
  const stages: Stage[] = ['new', 'new', 'replied', 'booked', 'assessed', 'sold', 'sold', 'sold', 'sold', 'lost'];
  const first: Record<Channel, (p: Person) => string> = {
    phone: (p) => `Voicemail (0:42): "Hi, this is ${p.name.split(' ')[0]}, calling about training for ${p.athlete === 'self' ? 'myself' : p.athlete!.split(' ')[0]}. ${p.sport} season's coming up. Call me back?"`,
    instagram: (p) => `DM: hey! saw your reel. how much for ${p.sport} speed training for my kid?`,
    web: (p) => `Contact form: Interested in ${p.sport} performance training for ${p.athlete}. What does the first visit look like?`,
  };
  const leads: Lead[] = people.map((p, i) => ({ id: 'L' + i, personId: p.id, channel: ch(i), stage: stages[i], createdAt: now - (i === 0 ? 0.6 * H : i === 1 ? 2.5 * H : (i + 1) * D), firstMessage: first[ch(i)](p), unread: i < 2, repliedAt: i >= 2 ? now - (i + 1) * D + (i % 2 ? 4 * H : 20 * 60e3) : undefined }));
  const messages: Message[] = leads.map((l, i) => ({ id: 'M' + i, personId: l.personId, dir: 'in', channel: l.channel, body: l.firstMessage, at: l.createdAt }));
  const bookings: Booking[] = [3, 4, 5, 6, 7, 8].map((i) => ({ id: 'B' + i, personId: people[i].id, kind: 'assessment', start: i === 3 ? Math.round((now + 1.2 * D) / H) * H : now - (i - 2) * D, status: i === 3 ? 'booked' : 'completed' }));
  // Grant (phone lead) missed yesterday's assessment: the no-show the AI agent reschedules.
  bookings.push({ id: 'B9', personId: people[9].id, kind: 'assessment', start: Math.round((now - 1 * D) / H) * H, status: 'noshow' });
  const sales: Sale[] = [
    { id: 'S5', personId: people[5].id, packageId: 'pv60-10', at: now - 40 * D, sessionsUsed: 9 },
    { id: 'S6', personId: people[6].id, packageId: 'pv30-5', at: now - 20 * D, sessionsUsed: 4 },
    { id: 'S7', personId: people[7].id, packageId: 'sp60-10', at: now - 30 * D, sessionsUsed: 5 },
    { id: 'S8', personId: people[8].id, packageId: 'pv90-5', at: now - 25 * D, sessionsUsed: 2 },
  ];
  const chat = { msgs: [{ id: 'c0', from: 'bot' as const, text: "Hey there! 👋 I'm the GoldMine Assistant. I can help with training, packages and prices, or get your athlete booked for an Initial Performance Assessment. What can I help with?", chips: START_CHIPS }], queue: [], mode: 'idle' as const };
  return { people, leads, bookings, messages, sales, followUpsSent: {}, chat, agent: {} };
}

export const START_CHIPS = [{ label: 'Prices & packages', act: 'prices' }, { label: 'Book an assessment', act: 'book' }, { label: 'What are your hours?', act: 'hours' }, { label: 'Talk to a coach', act: 'human' }];
export const NEW_LEAD = { name: 'Jordan Ellis', athlete: 'Maya (14)', sport: 'softball', phone: '(555) 0142-7781', email: 'jordan.ellis@example.com' };
export const NEW_LEAD_TEXT = 'Contact form: Hi! My daughter Maya (14) plays travel softball. Looking for speed + strength work before spring tryouts. How do we get started?';
