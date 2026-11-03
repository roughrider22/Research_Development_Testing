import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { backend } from './services';
import { NEW_LEAD, NEW_LEAD_TEXT } from './data';
import type { Channel, Lead, Message, Package, Person, Sale, Stage } from './types';
import logo from './assets/logo.png';
import { AUTO_LOG, chatInput, decide, deliverChat, finishAgents, proposals } from './ai';

type Tab = 'inbox' | 'follow' | 'renew' | 'dash' | 'ai';
const useDemo = () => useSyncExternalStore((f) => backend.subscribe(f), () => backend.state);
const money = (n: number) => '$' + n.toLocaleString('en-US');
const CH: Record<Channel, { label: string; icon: string }> = { web: { label: 'Web form', icon: '🌐' }, phone: { label: 'Phone / voicemail', icon: '📞' }, instagram: { label: 'Instagram DM', icon: '📸' } };
const STAGE: Record<Stage, string> = { new: 'New', replied: 'Replied', booked: 'Assessment booked', assessed: 'Assessed', sold: 'Package sold', lost: 'Closed' };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago'; };
const when = (t: number) => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const first = (p?: Person) => p?.name.split(' ')[0] ?? '';
const kid = (p?: Person) => (p?.athlete && p.athlete !== 'self' ? p.athlete.split(' ')[0] : 'you');

const autoReply = (p: Person) => `Hi ${first(p)}! Thanks for reaching out to GoldMine Performance 💛 Every athlete starts with an Initial Performance Assessment so we can build ${kid(p)}'s plan. Grab a time here: [booking link] — or reply with a day that works. – Coach, GoldMine`;
const FOLLOW = [
  { key: 'thanks', day: 'Same day', ch: 'sms' as const, body: (p: Person) => `Great work today, ${kid(p)}! Thanks for coming in. We'll send a recap of the assessment tonight. – GoldMine` },
  { key: 'recap', day: 'Day 1', ch: 'email' as const, body: (p: Person) => `Subject: ${kid(p)}'s assessment recap\nHi ${first(p)}, here's what we saw: strong base, room to grow in first-step speed and single-leg strength for ${p.sport}. Our plan below.` },
  { key: 'offer', day: 'Day 2', ch: 'sms' as const, body: (p: Person, k?: Package) => `Hi ${first(p)}, based on the assessment we recommend ${k?.name ?? 'a package'} (${k ? money(k.price) : ''}). Want me to lock in ${kid(p)}'s first session this week?` },
  { key: 'nudge', day: 'Day 5', ch: 'sms' as const, body: (p: Person) => `Quick check-in from GoldMine: still want to get ${kid(p)} started before the season? Reply YES and we'll set it up.` },
];

export default function App() {
  const s = useDemo();
  const [tab, setTab] = useState<Tab>('inbox');
  const [sel, setSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tRef = useRef(0);
  const flash = (t: string) => { setToast(t); window.clearTimeout(tRef.current); tRef.current = window.setTimeout(() => setToast(null), 2600); };
  const jordan = s.leads.find((l) => s.people.find((p) => p.id === l.personId)?.name === NEW_LEAD.name);
  const jSale = jordan && backend.activeSales().find((x) => x.personId === jordan.personId);
  const step = !jordan ? 1 : jordan.stage === 'new' || jordan.stage === 'replied' ? 2 : jordan.stage === 'booked' || jordan.stage === 'assessed' ? 3 : jSale && !jSale.reminderSentAt ? 4 : 5;
  const steps = ['New lead arrives', 'Instant reply + book', 'Follow-up → package sold', 'Renewal reminder', 'Results by source'];
  const hint = [
    'Tap “Simulate new lead” — a web-form inquiry lands in the unified inbox.',
    'Open Jordan’s lead: the instant reply already went out. Tap “Book assessment” and pick a slot.',
    'Mark the assessment done, then in Follow-up run the sequence and mark the package sold.',
    'In Renewals, fast-forward Jordan’s sessions and send the renewal reminder.',
    'Open Dashboard: leads and conversions by source.',
  ][step - 1];

  const simulateLead = () => {
    if (jordan) { setSel(jordan.id); setTab('inbox'); return; }
    const l = backend.create(NEW_LEAD, 'web', NEW_LEAD_TEXT);
    setTab('inbox');
    flash('New web-form lead: Jordan Ellis');
    void l;
  };
  // Instant reply is driven by state, not a one-shot timer, so a reset or reload mid-delay can't leave Jordan stuck or crash.
  const pendingReply = jordan && jordan.stage === 'new' && !backend.thread(jordan.personId).some((m) => m.dir === 'out') ? jordan.id : null;
  useEffect(() => {
    if (!pendingReply) return;
    const id = window.setTimeout(() => { const l = backend.get(pendingReply); const p = l && backend.person(l.personId); if (!l || !p || l.stage !== 'new') return; backend.send(p.id, 'sms', autoReply(p), 'Instant reply · 38 sec'); backend.setStage(l.id, 'replied'); flash('Instant reply sent (simulated)'); }, 1500);
    return () => window.clearTimeout(id);
  }, [pendingReply]);
  // AI drivers live at App level (always mounted) and are state-driven, so tab switches, reset, and reload can't strand them.
  const nextChat = s.chat.queue[0]?.dueAt;
  useEffect(() => { if (nextChat === undefined) return; const id = window.setTimeout(deliverChat, Math.max(0, nextChat - Date.now())); return () => window.clearTimeout(id); }, [nextChat, s.chat.queue.length]);
  const running = Object.values(s.agent).filter((e) => e.status === 'running').map((e) => e.dueAt ?? 0);
  const nextAgent = running.length ? Math.min(...running) : undefined;
  useEffect(() => { if (nextAgent === undefined) return; const id = window.setTimeout(() => { const before = Object.values(backend.state.agent).filter((e) => e.status === 'running').length; finishAgents(); if (before) flash('AI agent action done (simulated)'); }, Math.max(0, nextAgent - Date.now())); return () => window.clearTimeout(id); }, [nextAgent, running.length]);
  const [chatOpen, setChatOpen] = useState(false);
  const pendingAI = proposals(s).filter((p) => !s.agent[p.id]).length;
  const reset = () => { if (confirm('Reset the demo to its starting data?')) { backend.reset(); setSel(null); setTab('inbox'); flash('Demo reset'); } };

  return (
    <div className="app">
      <header className="top">
        <img src={logo} alt="GoldMine Performance" className="logo" />
        <div className="brand"><b>GoldMine Performance</b><span>Lead Desk · Villa Rica, GA</span></div>
        <span className="demo-pill">DEMO · sample data</span>
        <button className="ghost small" onClick={reset} data-testid="reset">↺ Reset demo</button>
      </header>
      <div className="guide" data-testid="guide">
        <ol>{steps.map((t, i) => <li key={t} className={i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}><span>{i + 1 < step ? '✓' : i + 1}</span>{t}</li>)}</ol>
        <p>{hint}</p>
      </div>
      <nav className="tabs">
        {([['inbox', 'Inbox', s.leads.filter((l) => l.unread).length], ['follow', 'Follow-up', s.leads.filter((l) => l.stage === 'assessed').length], ['renew', 'Renewals', backend.activeSales().filter((x) => left(x) <= 2 && !x.reminderSentAt).length], ['dash', 'Dashboard', 0], ['ai', 'AI Agents', pendingAI]] as [Tab, string, number][]).map(([k, t, n]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setSel(null); }} data-testid={'tab-' + k}>{t}{n > 0 && <i>{n}</i>}</button>)}
      </nav>
      <main>
        {tab === 'inbox' && <Inbox sel={sel} setSel={setSel} onSim={simulateLead} hasJordan={!!jordan} flash={flash} goFollow={() => { setTab('follow'); setSel(null); }} />}
        {tab === 'follow' && <FollowUp flash={flash} />}
        {tab === 'renew' && <Renewals flash={flash} />}
        {tab === 'dash' && <Dashboard />}
        {tab === 'ai' && <Agents flash={flash} />}
      </main>
      <footer>Demo only · fictional people · nothing is sent, all messages are <b>simulated</b> · Mindbody shown as a mock · AI assistant and AI agents are simulated (scripted, no AI model) · prices from goldmineperformance.com/prices</footer>
      {!chatOpen && <button className="chat-fab" onClick={() => setChatOpen(true)} data-testid="chat-open"><span>💬</span> Chat with us</button>}
      {chatOpen && <ChatWidget onClose={() => setChatOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

const left = (x: Sale) => (backend.pkg(x.packageId)?.sessions ?? 0) - x.sessionsUsed;

function Inbox({ sel, setSel, onSim, hasJordan, flash, goFollow }: { sel: string | null; setSel: (s: string | null) => void; onSim: () => void; hasJordan: boolean; flash: (t: string) => void; goFollow: () => void }) {
  const s = useDemo();
  const [filter, setFilter] = useState<Channel | 'all'>('all');
  const leads = backend.list().filter((l) => filter === 'all' || l.channel === filter);
  const lead = sel ? backend.get(sel) : undefined;
  return (
    <div className={'split' + (lead ? ' has-sel' : '')}>
      <section className="list">
        <div className="row-between">
          <div className="chips">{(['all', 'web', 'phone', 'instagram'] as const).map((c) => <button key={c} className={'chip' + (filter === c ? ' on' : '')} onClick={() => setFilter(c)}>{c === 'all' ? 'All' : CH[c].icon + ' ' + CH[c].label.split(' ')[0]}</button>)}</div>
          <button className="gold" onClick={onSim} data-testid="sim-lead">{hasJordan ? 'Open Jordan' : '+ Simulate new lead'}</button>
        </div>
        {leads.map((l) => { const p = s.people.find((x) => x.id === l.personId)!; return (
          <button key={l.id} className={'lead' + (sel === l.id ? ' on' : '') + (l.unread ? ' unread' : '')} onClick={() => { setSel(l.id); backend.markRead(l.id); }} data-testid={'lead-' + p.name.split(' ')[0]}>
            <span className={'src ' + l.channel}>{CH[l.channel].icon}</span>
            <span className="grow"><b>{p.name}</b><small>{l.firstMessage}</small></span>
            <span className="meta"><em className={'stage ' + l.stage}>{STAGE[l.stage]}</em><small>{ago(l.createdAt)}</small></span>
          </button>); })}
      </section>
      {lead && <LeadDetail lead={lead} onBack={() => setSel(null)} flash={flash} goFollow={goFollow} />}
    </div>
  );
}

function Thread({ msgs }: { msgs: Message[] }) {
  return <div className="thread">{msgs.map((m) => <div key={m.id} className={'msg ' + m.dir}>
    {m.auto && <span className="auto">⚡ {m.auto}</span>}
    <p>{m.body}</p>
    <small>{m.dir === 'in' ? CH[m.channel as Channel]?.label ?? m.channel : m.channel.toUpperCase()} · {ago(m.at)}{m.simulated && <b className="sim"> · simulated</b>}</small>
  </div>)}</div>;
}

function LeadDetail({ lead, onBack, flash, goFollow }: { lead: Lead; onBack: () => void; flash: (t: string) => void; goFollow: () => void }) {
  useDemo();
  const p = backend.person(lead.personId)!;
  const booking = backend.forPerson(p.id);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
  const replyMins = lead.repliedAt ? Math.max(0, Math.round((lead.repliedAt - lead.createdAt) / 60e3)) : null;
  return (
    <section className="detail" data-testid="detail">
      <button className="ghost small back" onClick={onBack}>← Inbox</button>
      <div className="card head">
        <h2>{p.name}</h2>
        <p className="muted">{p.athlete === 'self' ? 'Adult athlete' : 'Parent of ' + p.athlete} · {p.sport} · {p.phone} · {p.email}</p>
        <div className="tags"><span className={'src ' + lead.channel}>{CH[lead.channel].icon} {CH[lead.channel].label}</span><em className={'stage ' + lead.stage}>{STAGE[lead.stage]}</em>{replyMins !== null && <span className="tag">First reply: {replyMins < 1 ? 'under 1 min' : replyMins + ' min'}</span>}</div>
      </div>
      <Thread msgs={backend.thread(p.id)} />
      <div className="card actions">
        {(lead.stage === 'new' || lead.stage === 'replied') && !picking && <button className="gold big" onClick={() => setPicking(true)} data-testid="book">📅 Book assessment</button>}
        {picking && <div><h3>Initial Performance Assessment <small className="muted">· Mindbody (mock)</small></h3>
          <div className="slots">{backend.openSlots().slice(0, 9).map((t) => <button key={t} className="slot" data-testid="slot" onClick={() => {
            if (backend.forPerson(p.id)) return;
            backend.book(p.id, t); backend.setStage(lead.id, 'booked');
            backend.send(p.id, 'sms', `You're booked! ${kid(p) === 'you' ? 'Your' : kid(p) + "'s"} Initial Performance Assessment is ${when(t)} at GoldMine Performance, 141 Prospector Dr, Villa Rica. Wear trainers + bring water. Reply C to change.`, 'Booking confirmation');
            setPicking(false); flash('Assessment booked · confirmation sent (simulated)');
          }}>{when(t)}</button>)}</div></div>}
        {lead.stage === 'booked' && booking && <div><p>📅 Assessment: <b>{when(booking.start)}</b> <span className="tag">Mindbody mock</span></p>
          <button className="gold big" data-testid="assessed" onClick={() => { if (backend.get(lead.id)?.stage !== 'booked') return; backend.complete(booking.id); backend.setStage(lead.id, 'assessed'); backend.send(p.id, 'sms', FOLLOW[0].body(p), 'Follow-up 1/4 · auto'); backend.markFollowUp(p.id + ':thanks'); flash('Assessment done · follow-up sequence started'); }}>✓ Mark assessment done</button></div>}
        {lead.stage === 'assessed' && <button className="gold big" onClick={goFollow} data-testid="go-follow">Go to follow-up →</button>}
        {lead.stage === 'sold' && <p>✅ Package sold. See <b>Renewals</b> for sessions left.</p>}
        <form className="compose" onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; backend.send(p.id, 'sms', draft.trim()); if (lead.stage === 'new') backend.setStage(lead.id, 'replied'); setDraft(''); flash('Reply sent (simulated)'); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a reply (simulated, nothing is sent)" /><button className="ghost">Send</button>
        </form>
      </div>
    </section>
  );
}

function FollowUp({ flash }: { flash: (t: string) => void }) {
  const s = useDemo();
  const rows = backend.list().filter((l) => l.stage === 'assessed' || l.stage === 'booked');
  return (
    <section className="stack">
      <h2>Assessment → package</h2>
      <p className="muted">After every assessment a 4-step sequence runs automatically. Staff can step in or mark the sale at any point.</p>
      {rows.length === 0 && <div className="card muted">No one waiting on follow-up right now.</div>}
      {rows.map((l) => <FollowCard key={l.id} lead={l} sent={s.followUpsSent} flash={flash} />)}
    </section>
  );
}
function FollowCard({ lead, sent, flash }: { lead: Lead; sent: Record<string, number>; flash: (t: string) => void }) {
  const p = backend.person(lead.personId)!;
  const [pkgId, setPkgId] = useState('pv60-10');
  const k = backend.pkg(pkgId);
  const cats = useMemo(() => Array.from(new Set(backend.pkgs().map((x) => x.category))), []);
  const sendStep = (f: (typeof FOLLOW)[number], i: number) => { if (backend.state.followUpsSent[p.id + ':' + f.key]) return; backend.send(p.id, f.ch, f.body(p, k), `Follow-up ${i + 1}/4 · ${f.day}`); backend.markFollowUp(p.id + ':' + f.key); };
  return (
    <div className="card" data-testid={'follow-' + first(p)}>
      <div className="row-between"><div><h3>{p.name}</h3><p className="muted">{p.athlete === 'self' ? 'Adult' : p.athlete} · {p.sport} · <em className={'stage ' + lead.stage}>{STAGE[lead.stage]}</em></p></div></div>
      {lead.stage === 'assessed' ? <>
        <label className="lbl">Recommended package<select value={pkgId} onChange={(e) => setPkgId(e.target.value)} data-testid="pkg">
          {cats.map((c) => <optgroup key={c} label={c}>{backend.pkgs().filter((x) => x.category === c).map((x) => <option key={x.id} value={x.id}>{x.name} — {money(x.price)}{x.perPerson ? ' pp' : ''}</option>)}</optgroup>)}
        </select></label>
        <ol className="seq">{FOLLOW.map((f, i) => { const done = sent[p.id + ':' + f.key]; return <li key={f.key} className={done ? 'done' : ''}>
          <span className="day">{f.day} · {f.ch.toUpperCase()}</span><p>{f.body(p, k)}</p>
          {done ? <small className="sim">✓ sent · simulated</small> : <button className="ghost small" onClick={() => { sendStep(f, i); flash('Sent (simulated)'); }}>Send now</button>}
        </li>; })}</ol>
        <div className="row-between wrap">
          <button className="ghost" data-testid="run-seq" onClick={() => { FOLLOW.forEach((f, i) => { if (!sent[p.id + ':' + f.key]) sendStep(f, i); }); flash('Sequence fast-forwarded (simulated)'); }}>⏩ Fast-forward sequence</button>
          <button className="gold big" data-testid="sold" onClick={() => { if (backend.get(lead.id)?.stage !== 'assessed') return; backend.recordSale(p.id, pkgId); backend.setStage(lead.id, 'sold'); backend.send(p.id, 'sms', `Welcome to GoldMine, ${first(p)}! ${k?.name} is all set. See you at the first session 💪`, 'Welcome · auto'); flash(`Sold: ${k?.name} · ${money(k!.price)} (Mindbody mock)`); }}>💰 Mark sold · {money(k!.price)}</button>
        </div>
      </> : <p className="muted">Assessment booked for {when(backend.forPerson(p.id)?.start ?? Date.now())}. Sequence starts when it’s marked done.</p>}
    </div>
  );
}

function Renewals({ flash }: { flash: (t: string) => void }) {
  useDemo();
  const sales = backend.activeSales();
  const low = sales.filter((x) => left(x) <= 2);
  const ok = sales.filter((x) => left(x) > 2);
  const Row = ({ x }: { x: Sale }) => { const p = backend.person(x.personId)!; const k = backend.pkg(x.packageId)!; const l = left(x); return (
    <div className="card renew" data-testid={'renew-' + first(p)}>
      <div className="grow"><h3>{p.name}</h3><p className="muted">{k.name}</p>
        <div className="meter"><span style={{ width: (100 * x.sessionsUsed) / k.sessions + '%' }} /></div>
        <small>{l} of {k.sessions} session{k.sessions > 1 ? 's' : ''} left</small></div>
      <div className="col">
        {l > 2 && <button className="ghost small" data-testid="ff" onClick={() => { backend.useSessions(x.id, k.sessions - 1); flash('Fast-forwarded: 1 session left'); }}>⏩ Fast-forward 4 weeks</button>}
        {l <= 2 && !x.reminderSentAt && <button className="gold" data-testid="remind" onClick={() => { if (backend.activeSales().find((y) => y.id === x.id)?.reminderSentAt) return; backend.send(p.id, 'sms', `Hi ${first(p)}! ${kid(p) === 'you' ? 'You have' : kid(p) + ' has'} ${l} session${l === 1 ? '' : 's'} left on ${k.name}. Renew now and keep the momentum going — same time slot is held for you. Reply RENEW.`, 'Renewal reminder'); backend.markReminder(x.id); flash('Renewal reminder sent (simulated) · staff notified'); }}>🔔 Send renewal reminder</button>}
        {x.reminderSentAt && <><small className="sim">✓ reminder sent · simulated</small><button className="ghost small" data-testid="renewed" onClick={() => { if (!backend.activeSales().some((y) => y.id === x.id)) return; backend.recordSale(p.id, x.packageId, x.id); flash(`Renewed: ${money(k.price)} (Mindbody mock)`); }}>Mark renewed</button></>}
      </div>
    </div>); };
  return (
    <section className="stack">
      <h2>Renewal reminders</h2>
      <p className="muted">Families with 2 or fewer sessions left get a nudge, and staff get a heads-up.</p>
      <h3 className="sub">Running low ({low.length})</h3>{low.map((x) => <Row key={x.id} x={x} />)}
      <h3 className="sub">Active packages ({ok.length})</h3>{ok.map((x) => <Row key={x.id} x={x} />)}
    </section>
  );
}

function Dashboard() {
  const s = useDemo();
  const by = (['web', 'phone', 'instagram'] as Channel[]).map((c) => {
    const ls = s.leads.filter((l) => l.channel === c);
    const booked = ls.filter((l) => ['booked', 'assessed', 'sold'].includes(l.stage)).length;
    const sold = ls.filter((l) => l.stage === 'sold');
    const rev = s.sales.filter((x) => sold.some((l) => l.personId === x.personId)).reduce((a, x) => a + (backend.pkg(x.packageId)?.price ?? 0), 0);
    return { c, leads: ls.length, booked, sold: sold.length, rev };
  });
  const tot = by.reduce((a, b) => ({ leads: a.leads + b.leads, booked: a.booked + b.booked, sold: a.sold + b.sold, rev: a.rev + b.rev }), { leads: 0, booked: 0, sold: 0, rev: 0 });
  const assessed = s.bookings.filter((b) => b.status === 'completed').length;
  const replied = s.leads.filter((l) => l.repliedAt);
  const mins = (ls: typeof replied) => (ls.length ? Math.round(ls.reduce((a, l) => a + (l.repliedAt! - l.createdAt), 0) / ls.length / 60e3) : null);
  const fmt = (m: number | null) => (m === null ? '—' : m < 1 ? '<1m' : m < 60 ? m + 'm' : Math.round(m / 60) + 'h');
  const before = mins(replied.filter((l) => l.id.startsWith('L'))), after = mins(replied.filter((l) => !l.id.startsWith('L')));
  const avg = replied.length ? Math.round(replied.reduce((a, l) => a + (l.repliedAt! - l.createdAt), 0) / replied.length / 60e3) : 0;
  const max = Math.max(1, ...by.map((b) => b.leads));
  return (
    <section className="stack" data-testid="dash">
      <h2>Leads & conversions by source</h2>
      <div className="kpis">
        <div className="kpi"><b>{tot.leads}</b><span>Leads</span></div>
        <div className="kpi"><b>{tot.booked}</b><span>Assessments booked</span></div>
        <div className="kpi"><b>{assessed ? Math.round((100 * tot.sold) / assessed) : 0}%</b><span>Assessment → package</span></div>
        <div className="kpi"><b>{money(tot.rev)}</b><span>Package revenue</span></div>
        <div className="kpi"><b>{avg < 60 ? avg + 'm' : Math.round(avg / 60) + 'h'}</b><span>Avg first reply</span><small className="kpi-note" data-testid="reply-split">Sample history {fmt(before)} · auto-reply {fmt(after)}</small></div>
      </div>
      <div className="card">
        <table className="src-table"><thead><tr><th>Source</th><th>Leads</th><th>Booked</th><th>Sold</th><th>Conv.</th><th>Revenue</th></tr></thead>
          <tbody>{by.map((b) => <tr key={b.c}><td>{CH[b.c].icon} {CH[b.c].label}</td><td>{b.leads}</td><td>{b.booked}</td><td>{b.sold}</td><td>{b.leads ? Math.round((100 * b.sold) / b.leads) : 0}%</td><td>{money(b.rev)}</td></tr>)}</tbody></table>
      </div>
      <div className="card bars">{by.map((b) => <div key={b.c} className="bar-row"><span>{CH[b.c].icon} {CH[b.c].label}</span>
        <div className="bar"><i className="l" style={{ width: (100 * b.leads) / max + '%' }}>{b.leads}</i></div>
        <div className="bar"><i className="b" style={{ width: (100 * b.booked) / max + '%' }}>{b.booked}</i></div>
        <div className="bar"><i className="s" style={{ width: (100 * b.sold) / max + '%' }}>{b.sold}</i></div></div>)}
        <div className="legend"><span><i className="l" />Leads</span><span><i className="b" />Booked</span><span><i className="s" />Sold</span></div></div>
    </section>
  );
}

function ChatWidget({ onClose }: { onClose: () => void }) {
  const s = useDemo(); const c = s.chat;
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [c.msgs.length, c.queue.length]);
  const lastBot = [...c.msgs].reverse().find((m) => m.from === 'bot');
  return (
    <aside className="chat" data-testid="chat" aria-label="GoldMine Assistant">
      <header><img src={logo} alt="" /><div className="grow"><b>GoldMine Assistant</b><small>AI assistant, simulated · usually replies instantly</small></div><button className="ghost small" onClick={onClose} aria-label="Close chat" data-testid="chat-close">✕</button></header>
      <div className="chat-sim">AI assistant, simulated: scripted replies, no AI model, nothing leaves this device</div>
      <div className="chat-body" data-testid="chat-body">
        {c.msgs.map((m) => <div key={m.id} className={'bubble ' + m.from}>
          <p>{m.text}</p>
          {m.chips && m === lastBot && !m.used && c.queue.length === 0 && <div className="qchips">{m.chips.map((ch) => <button key={ch.act} className="qchip" data-testid="qchip" onClick={() => chatInput(ch.label, ch.act, m.id)}>{ch.label}</button>)}</div>}
        </div>)}
        {c.queue.length > 0 && <div className="bubble bot typing" data-testid="typing" aria-label="Assistant is typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t || c.queue.length) return; chatInput(t); setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={c.mode === 'name' ? 'Type your name…' : 'Ask about training, prices, hours…'} data-testid="chat-input" maxLength={280} />
        <button className="gold" data-testid="chat-send" disabled={c.queue.length > 0}>Send</button>
      </form>
    </aside>
  );
}

function Agents({ flash }: { flash: (t: string) => void }) {
  const s = useDemo();
  const props = proposals(s);
  const pending = props.filter((p) => !s.agent[p.id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const done = Object.entries(s.agent).sort((a, b) => b[1].at - a[1].at);
  const ORDER = ['reengage', 'recommend', 'noshow', 'summary'];
  const cards: { id: string; kind: string; title: string; why: string; body: string; sensitive: boolean }[] = [...pending, ...done.map(([id, e]) => props.find((p) => p.id === id) ?? { id, kind: e.kind, title: e.title, why: '', body: e.body, sensitive: true })]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  return (
    <section className="stack" data-testid="agents">
      <h2>AI agent actions <span className="tag sim-tag">simulated</span></h2>
      <p className="muted">Agents watch the inbox, bookings and packages and act on their own. Anything that messages a family or moves a booking waits for staff to <b>Approve</b>, <b>Edit</b> or <b>Dismiss</b>.</p>
      <h3 className="sub">Needs your OK ({pending.length})</h3>
      {pending.length === 0 && <div className="card muted">All caught up. Agents will queue new actions as things happen.</div>}
      {/* Decided cards stay in place (collapsed) so a double tap can't land on the card that slides up underneath. */}
      {cards.map((p) => s.agent[p.id] ? <div key={p.id} className="card agent decided" data-testid={'decided-' + p.kind}>
        <b>{s.agent[p.id].status === 'running' ? '⏳' : s.agent[p.id].status === 'approved' ? '✅' : '✕'} {s.agent[p.id].title}</b>
        <small className="muted"> · {s.agent[p.id].status === 'running' ? 'Working…' : s.agent[p.id].status === 'approved' ? s.agent[p.id].result || 'Done' : 'Dismissed'} · simulated</small>
      </div> : <div key={p.id} className="card agent" data-testid={'agent-' + p.kind}>
        <div className="row-between"><b>🤖 {p.title}</b><span className={'tag ' + (p.sensitive ? 'warn' : '')}>{p.sensitive ? 'Needs approval' : 'Internal draft'}</span></div>
        <p className="muted small-t">{p.why}</p>
        {editing === p.id ? <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={p.kind === 'summary' ? 7 : 4} data-testid="agent-edit-box" /> : <p className="draft">{p.body}</p>}
        <small className="sim">AI agent, simulated · {p.sensitive ? 'nothing is sent' : 'never sent'}</small>
        <div className="agent-btns">
          <button className="gold" data-testid="agent-approve" onClick={() => { decide(p as never, 'running', editing === p.id ? draft : undefined); setEditing(null); flash('Approved · agent is working (simulated)'); }}>✓ Approve</button>
          {editing === p.id ? <button className="ghost" onClick={() => setEditing(null)}>Cancel edit</button> : <button className="ghost" data-testid="agent-edit" onClick={() => { setEditing(p.id); setDraft(p.body); }}>✎ Edit</button>}
          <button className="ghost" data-testid="agent-dismiss" onClick={() => { decide(p as never, 'dismissed'); flash('Dismissed'); }}>Dismiss</button>
        </div>
      </div>)}
      <h3 className="sub">Activity</h3>
      <div className="card feed" data-testid="agent-feed">
        {done.map(([id, e]) => <div key={id} className="feed-row" data-testid={'feed-' + e.kind}>
          <span>{e.status === 'running' ? '⏳' : e.status === 'approved' ? '✅' : '✕'}</span>
          <div className="grow"><b>{e.title}</b><small>{e.status === 'running' ? 'Working…' : e.status === 'approved' ? (e.result || 'Done') + (e.edited ? ' · edited by staff' : '') : 'Dismissed by staff'} · {ago(e.at)} · simulated</small>
            {e.kind === 'summary' && e.status === 'approved' && <p className="draft">{e.body}</p>}</div>
        </div>)}
        {AUTO_LOG.map((t) => <div key={t} className="feed-row"><span>⚡</span><div className="grow"><b>{t}</b><small>Automatic · simulated</small></div></div>)}
      </div>
    </section>
  );
}
