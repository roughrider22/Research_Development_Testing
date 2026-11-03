// Simulated AI: scripted/branching replies + keyword matcher. No model calls, no network.
import { backend } from './services';
import { START_CHIPS } from './data';
import type { AgentEntry, ChatMsg, Chip, DemoState, Person } from './types';

const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number) => '$' + n.toLocaleString('en-US');
const when = (t: number) => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const first = (p?: Person) => p?.name.split(' ')[0] ?? '';
const NEXT: Chip[] = [{ label: 'Book an assessment', act: 'book' }, { label: 'See prices', act: 'prices' }, { label: 'Talk to a coach', act: 'human' }];
const priceOf = (id: string) => money(backend.pkg(id)!.price);

// ---------- chat ----------
type Reply = { text: string; chips?: Chip[] };
function intent(t: string): string {
  const s = t.toLowerCase();
  if (/\b(hour|open|close|closing|when are you|schedule|weekend|saturday|sunday)\b/.test(s)) return 'hours';
  if (/\b(human|person|staff|coach|someone|call me|talk|phone|real)\b/.test(s)) return 'human';
  if (/\b(book|assess|evaluation|eval|start|sign up|signup|first visit|trial|appointment)\b/.test(s)) return 'book';
  if (/semi|two athletes|2 athletes|partner|sibling|friend/.test(s)) return 'semi';
  if (/\b(price|cost|how much|package|rate|\$|expensive|cheap|session)/.test(s)) return 'prices';
  if (/\b(train|speed|strength|agility|program|sport|baseball|softball|football|soccer|volleyball|basketball|track|age|kid|son|daughter)/.test(s)) return 'training';
  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(s)) return 'hello';
  if (/\b(thank|thanks|thx|awesome|great|perfect)\b/.test(s)) return 'thanks';
  return 'fallback';
}
function replyFor(act: string, c: DemoState['chat']): Reply[] {
  switch (act) {
    case 'hello': return [{ text: 'Hi! 😊 Happy to help. Are you asking about training, prices, or getting started?', chips: START_CHIPS }];
    case 'thanks': return [{ text: "Anytime! If anything else comes up I'm right here. 💛", chips: NEXT }];
    case 'prices': return [
      { text: `Here's how private training works at GoldMine (1 / 5 / 10 sessions):\n• 30 min: ${priceOf('pv30-1')} / ${priceOf('pv30-5')} / ${priceOf('pv30-10')}\n• 60 min: ${priceOf('pv60-1')} / ${priceOf('pv60-5')} / ${priceOf('pv60-10')}\n• 90 min: ${priceOf('pv90-1')} / ${priceOf('pv90-5')} / ${priceOf('pv90-10')}\n• 120 min: ${priceOf('pv120-1')} / ${priceOf('pv120-5')} / ${priceOf('pv120-10')}` },
      { text: 'Training with a teammate or sibling? Semi-private is an option too. Most families start with an assessment so the coach can recommend the right fit.', chips: [{ label: 'Semi-private prices', act: 'semi' }, { label: 'Book an assessment', act: 'book' }, { label: 'Talk to a coach', act: 'human' }] }];
    case 'semi': return [{ text: `Semi-private is 60 minutes for 2 athletes, priced per athlete: ${priceOf('sp60-1')} for 1 session, ${priceOf('sp60-5')} for 5, ${priceOf('sp60-10')} for 10. Great for siblings or teammates!`, chips: NEXT }];
    case 'training': return [{ text: "We build each athlete's plan around their sport and goals: speed, strength, and staying healthy through the season. It all starts with an Initial Performance Assessment so a coach can see where they are today. Want me to find a time?", chips: [{ label: 'Yes, book it', act: 'book' }, { label: 'Prices first', act: 'prices' }, { label: 'Talk to a coach', act: 'human' }] }];
    case 'hours': return [{ text: "Good question! I don't want to give you the wrong hours, so I'd rather have the team confirm them for you. Want me to ask a coach to reach out? In the meantime I can show you open assessment times.", chips: [{ label: 'Yes, have staff confirm', act: 'human' }, { label: 'Show open times', act: 'book' }] }];
    case 'book':
      if (c.personId && backend.forPerson(c.personId)) return [{ text: `You're already booked for ${when(backend.forPerson(c.personId)!.start)}. 🙌 Need something else?`, chips: NEXT }];
      if (!c.name) return [{ text: "Awesome, let's get your athlete in! 🏋️ First, what's your name?", chips: [{ label: "I'm Casey Rivera (sample)", act: 'name:Casey Rivera' }] }];
      return [slotsMsg(c.name)];
    case 'human': return [{ text: `Of course! I'm passing this chat to the GoldMine team now${c.name ? ', ' + c.name.split(' ')[0] : ''}. A coach will pick it up in the Lead Desk inbox. 🙌`, chips: [{ label: 'Book an assessment', act: 'book' }] }];
    default: return [{ text: "Hmm, I'm not sure I caught that, sorry! I can help with prices, training, or booking, or I can hand you to a coach.", chips: START_CHIPS }];
  }
}
function slotsMsg(name: string): Reply {
  return { text: `Thanks ${name.split(' ')[0]}! Here are the next open Initial Performance Assessment times:`, chips: backend.openSlots().slice(0, 4).map((t) => ({ label: when(t), act: 'slot:' + t })) };
}
const mk = (r: Reply, from: 'bot' | 'user' = 'bot'): ChatMsg => ({ id: 'c' + uid(), from, text: r.text, chips: r.chips });
function enqueue(msgs: ChatMsg[]) {
  const c = backend.state.chat; let t = Math.max(Date.now(), ...c.queue.map((q) => q.dueAt));
  const queue = [...c.queue, ...msgs.map((m) => ({ msg: m, dueAt: (t += 700 + Math.min(1100, m.text.length * 8)) }))];
  backend.state.chat = { ...c, queue }; backend.commit();
}
function ensureLead(name: string, why: string) {
  const c = backend.state.chat;
  if (c.personId && backend.person(c.personId)) return c.personId;
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') || 'visitor';
  const l = backend.create({ name, athlete: 'self', sport: 'performance training', phone: '(555) 0177-4410', email: slug + '@example.com' }, 'web', `Website chat (AI assistant, simulated): ${why}`);
  backend.state.chat = { ...backend.state.chat, personId: l.personId }; backend.commit();
  return l.personId;
}
/** Handle a chip tap (msgId = the bot message it belongs to) or free text. Idempotent per chip set. */
export function chatInput(text: string, act?: string, msgId?: string) {
  const c = backend.state.chat;
  if (msgId) { const last = [...c.msgs].reverse().find((m) => m.from === 'bot'); if (!last || last.id !== msgId || last.used || c.queue.length) return; }
  const msgs = c.msgs.map((m) => (m.chips && !m.used ? { ...m, used: true } : m));
  backend.state.chat = { ...c, msgs: [...msgs, mk({ text: text.slice(0, 280) }, 'user')] }; backend.commit();
  const it = intent(text);
  let a = act ?? (backend.state.chat.mode === 'name' && ['fallback', 'hello', 'book'].includes(it) ? 'name:' + text.trim().slice(0, 40) : it);
  if (!act && a !== 'book' && !a.startsWith('name:') && backend.state.chat.mode === 'name') { backend.state.chat = { ...backend.state.chat, mode: 'idle' }; backend.commit(); }
  if (a.startsWith('name:')) {
    const name = a.slice(5).replace(/^i'?m\s+|^my name is\s+|^this is\s+/i, '').trim() || 'Website visitor';
    backend.state.chat = { ...backend.state.chat, name, mode: 'idle' }; backend.commit();
    return enqueue([mk(slotsMsg(name))]);
  }
  if (a.startsWith('slot:')) {
    const t = Number(a.slice(5)); const cs = backend.state.chat;
    if (cs.personId && backend.forPerson(cs.personId)) return enqueue(replyFor('book', cs).map((r) => mk(r)));
    if (!backend.openSlots().includes(t)) return enqueue([mk(slotsMsg(cs.name ?? 'there'))]);
    const pid = ensureLead(cs.name ?? 'Website visitor', 'booked an Initial Performance Assessment in chat');
    const lead = backend.state.leads.find((l) => l.personId === pid)!;
    backend.book(pid, t); backend.setStage(lead.id, 'booked');
    backend.send(pid, 'sms', `You're booked! Initial Performance Assessment ${when(t)} at GoldMine Performance. Wear trainers + bring water. Reply C to change.`, 'AI assistant · booked in chat');
    return enqueue([mk({ text: `You're all set for ${when(t)}! 🎉 I just texted you a confirmation (simulated), and the coaches can see it in their inbox. Anything else?`, chips: [{ label: 'What should we bring?', act: 'bring' }, { label: 'Talk to a coach', act: 'human' }] })]);
  }
  if (a === 'bring') return enqueue([mk({ text: 'Just comfy athletic clothes, trainers, and a water bottle. The coach takes it from there! 💪', chips: NEXT })]);
  if (a === 'book' && !backend.state.chat.name) { backend.state.chat = { ...backend.state.chat, mode: 'name' }; backend.commit(); }
  if (a === 'human' && !backend.state.chat.handedOff) {
    const pid = ensureLead(backend.state.chat.name ?? 'Website chat visitor', 'asked to talk to a coach');
    backend.send(pid, 'sms', `Chat handed off to staff by GoldMine Assistant. Last message: "${text.slice(0, 120)}"`, 'AI assistant · handoff to staff');
    backend.state.chat = { ...backend.state.chat, handedOff: true }; backend.commit();
  }
  enqueue(replyFor(a, backend.state.chat).map((r) => mk(r)));
}
/** Deliver due bot messages; called by a state-driven timer so reset/reload mid-typing is safe. */
export function deliverChat() {
  const c = backend.state.chat; const now = Date.now();
  const due = c.queue.filter((q) => q.dueAt <= now + 30); if (!due.length) return;
  backend.state.chat = { ...c, msgs: [...c.msgs, ...due.map((q) => q.msg)], queue: c.queue.filter((q) => !due.includes(q)) }; backend.commit();
}

// ---------- agent actions ----------
export interface Proposal { id: string; kind: 'reengage' | 'recommend' | 'noshow' | 'summary'; title: string; why: string; body: string; personId?: string; sensitive: boolean }
export function weeklySummary(s: DemoState) {
  const by = (['web', 'phone', 'instagram'] as const).map((c) => { const ls = s.leads.filter((l) => l.channel === c); return { c, n: ls.length, sold: ls.filter((l) => l.stage === 'sold').length }; });
  const booked = s.leads.filter((l) => ['booked', 'assessed', 'sold'].includes(l.stage)).length;
  const rev = s.sales.reduce((a, x) => a + (backend.pkg(x.packageId)?.price ?? 0), 0);
  const low = backend.activeSales().filter((x) => (backend.pkg(x.packageId)?.sessions ?? 0) - x.sessionsUsed <= 2).length;
  const best = [...by].sort((a, b) => b.sold - a.sold)[0];
  return `Weekly summary (draft for the owner)\n• ${s.leads.length} leads: web ${by[0].n}, phone ${by[1].n}, Instagram ${by[2].n}\n• ${booked} assessments booked · ${s.sales.length} packages sold · ${money(rev)} package revenue (sample data)\n• Best source by sales: ${best.c === 'web' ? 'web form' : best.c === 'phone' ? 'phone' : 'Instagram'}\n• ${low} famil${low === 1 ? 'y' : 'ies'} with 2 or fewer sessions left, renewal reminders queued\n• Suggestion: keep the instant reply on and follow up on quiet leads within 48h.`;
}
export function proposals(s: DemoState): Proposal[] {
  const out: Proposal[] = []; const now = Date.now();
  for (const l of s.leads) {
    const p = s.people.find((x) => x.id === l.personId)!;
    const kidName = p.athlete && p.athlete !== 'self' ? p.athlete.split(' ')[0] : 'you';
    if (l.stage === 'replied' && l.repliedAt && now - l.repliedAt > 48 * 3600e3 && !s.bookings.some((b) => b.personId === p.id))
      out.push({ id: 're:' + p.id, kind: 'reengage', personId: p.id, sensitive: true, title: `Re-engage ${p.name}`, why: `Quiet ${Math.round((now - l.repliedAt) / 86400e3)} days after our reply, no assessment booked.`, body: `Hi ${first(p)}! Just checking in from GoldMine. Still thinking about ${p.sport} training for ${kidName}? We have assessment times open this week. Want me to save one? 😊` });
    if (l.stage === 'assessed')
      out.push({ id: 'rec:' + p.id, kind: 'recommend', personId: p.id, sensitive: true, title: `Recommend a package to ${p.name}`, why: `Assessment done. For in-season ${p.sport}, the agent suggests Private 60-Minute · 10 Sessions (${priceOf('pv60-10')}).`, body: `Hi ${first(p)}, great to see ${kidName} at the assessment! Based on what the coach saw, we'd recommend Private 60-Minute · 10 Sessions (${priceOf('pv60-10')}). Want me to lock in the first session this week?` });
  }
  for (const b of s.bookings.filter((x) => x.status === 'noshow')) {
    const p = s.people.find((x) => x.id === b.personId)!; const slot = backend.openSlots()[0];
    out.push({ id: 'ns:' + b.id, kind: 'noshow', personId: p.id, sensitive: true, title: `Reschedule no-show: ${p.name}`, why: `Missed the assessment on ${when(b.start)}. Next open slot: ${when(slot)}.`, body: `Hi ${first(p)}, we missed you at your assessment. No worries, life happens! I can move it to ${when(slot)}. Does that work? Reply YES and you're set.` });
  }
  out.push({ id: 'sum:week', kind: 'summary', sensitive: false, title: "Draft the owner's weekly summary", why: 'Built from the dashboard numbers. Internal only, never sent.', body: weeklySummary(s) });
  return out;
}
export function decide(p: Proposal, status: 'running' | 'dismissed', body?: string) {
  const cur = backend.state.agent[p.id]; if (cur && cur.status !== 'pending') return;
  const e: AgentEntry = { status, kind: p.kind, title: p.title, body: body ?? p.body, personId: p.personId, at: Date.now(), dueAt: status === 'running' ? Date.now() + 1200 : undefined, edited: body !== undefined && body !== p.body };
  backend.state.agent = { ...backend.state.agent, [p.id]: e }; backend.commit();
}
/** Finish running actions (state-driven timer: reset/reload mid-action safe, applies exactly once). */
export function finishAgents() {
  const now = Date.now();
  for (const [id, e] of Object.entries(backend.state.agent)) {
    if (e.status !== 'running' || (e.dueAt ?? 0) > now + 30) continue;
    backend.state.agent = { ...backend.state.agent, [id]: { ...e, status: 'approved' } }; backend.commit();
    let result = '';
    if (e.kind === 'reengage' && e.personId) { backend.send(e.personId, 'sms', e.body, 'AI agent · re-engage · staff-approved'); result = 'Text sent (simulated)'; }
    if (e.kind === 'recommend' && e.personId) { backend.send(e.personId, 'sms', e.body, 'AI agent · package recommendation · staff-approved'); backend.markFollowUp(e.personId + ':offer'); result = 'Recommendation sent (simulated)'; }
    if (e.kind === 'noshow' && e.personId) {
      const b = backend.state.bookings.find((x) => 'ns:' + x.id === id); const slot = backend.openSlots()[0];
      if (b && b.status === 'noshow') { backend.reschedule(b.id, slot); const l = backend.state.leads.find((x) => x.personId === e.personId); if (l) backend.setStage(l.id, 'booked'); backend.send(e.personId, 'sms', e.body, 'AI agent · rescheduled · staff-approved'); result = 'Rebooked ' + when(slot) + ' · text sent (simulated)'; }
    }
    if (e.kind === 'summary') result = 'Saved to owner notes (not sent)';
    backend.state.agent = { ...backend.state.agent, [id]: { ...backend.state.agent[id], result } }; backend.commit();
  }
}
export const AUTO_LOG = ['Tagged every new lead by source (web, phone, Instagram)', 'Sent instant replies to new leads within a minute', 'Flagged families with 2 or fewer sessions left for renewal'];
