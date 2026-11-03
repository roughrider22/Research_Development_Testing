import { chromium } from 'playwright';
const file = 'file://' + process.cwd() + '/dist/index.html';
const KEY = 'goldmine-demo-state-v2';
const b = await chromium.launch(); const R = {};
const VPS = [['laptop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]];
async function mk(vp, mobile) { const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const net = [], errs = [];
  page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) net.push(r.url()); });
  page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('dialog', (d) => d.accept());
  await page.goto(file); return { ctx, page, net, errs }; }
const st = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const over = (p) => p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) > screen.width || [...document.querySelectorAll('.chat-body,.stack')].some((e) => e.scrollWidth > e.clientWidth + 1));
const settle = (p) => p.waitForFunction(() => !document.querySelector('[data-testid=typing]'), null, { timeout: 15000 });
const chip = async (p, re, mobile) => { const l = p.locator('[data-testid=qchip]', { hasText: re }).first(); await l.waitFor(); mobile ? await l.tap() : await l.click(); await settle(p); };
const say = async (p, t) => { await p.fill('[data-testid=chat-input]', t); await p.locator('[data-testid=chat-send]').click(); await settle(p); };
const lastBot = (p) => p.locator('.bubble.bot').last().innerText();
for (const [name, vp, mobile] of VPS) {
  const { ctx, page, net, errs } = await mk(vp, mobile); const r = {}; const tap = async (s) => { const l = page.locator(s).first(); await l.scrollIntoViewIfNeeded(); mobile ? await l.tap() : await l.click(); };
  // FLOW: chat
  await tap('[data-testid=chat-open]'); r.label = await page.locator('.chat-sim').innerText();
  await chip(page, 'Prices', mobile); r.prices = (await page.locator('.bubble.bot').nth(1).innerText()).includes('$700');
  await say(page, 'what are your hours on saturday?'); r.hours = await lastBot(page); r.hoursInvented = /\d\s?(am|pm)/i.test(r.hours);
  await say(page, 'my son plays baseball, what training do you do?'); r.training = /assessment/i.test(await lastBot(page));
  await say(page, 'asdf qwerty'); r.fallback = (await lastBot(page)).includes('not sure');
  await chip(page, 'Book an assessment', mobile); await chip(page, 'Casey Rivera', mobile);
  await page.screenshot({ path: `/workspace/goldmine-demo/screens/test-ai-chat-${name}.png` });
  await chip(page, /\d:\d\d/, mobile); r.booked = await lastBot(page);
  await chip(page, 'Talk to a coach', mobile);
  r.overflowChat = await over(page);
  let s = await st(page); const casey = s.people.find((x) => x.name === 'Casey Rivera');
  r.caseyLeads = s.leads.filter((l) => l.personId === casey?.id).map((l) => l.stage + '/' + l.channel); r.caseyBookings = s.bookings.filter((x) => x.personId === casey?.id).length;
  await tap('[data-testid=chat-close]'); await tap('[data-testid=tab-inbox]'); r.inboxHasCasey = await page.locator('[data-testid=lead-Casey]').count();
  await tap('[data-testid=lead-Casey]'); r.caseyThread = (await page.locator('.thread').innerText()).includes('handoff to staff');
  // AGENTS
  await tap('[data-testid=tab-ai]'); r.pendingKinds = await page.locator('[data-testid^=agent-]').evaluateAll((e) => e.map((x) => x.dataset.testid).filter((t) => /agent-(reengage|recommend|noshow|summary)/.test(t)));
  await page.screenshot({ path: `/workspace/goldmine-presentation/screens/ai-agents-${name}.png` });
  await tap('[data-testid=agent-reengage] [data-testid=agent-edit]'); await page.fill('[data-testid=agent-reengage] textarea', 'Hi Priya! Edited by staff: we have Saturday times open for Anika.'); await tap('[data-testid=agent-reengage] [data-testid=agent-approve]');
  await tap('[data-testid=agent-recommend] [data-testid=agent-approve]');
  await tap('[data-testid=agent-noshow] [data-testid=agent-approve]');
  await tap('[data-testid=agent-summary] [data-testid=agent-approve]');
  await page.waitForFunction(() => !document.body.innerText.includes('Working…'), null, { timeout: 8000 });
  r.feed = (await page.locator('[data-testid=agent-feed]').innerText()).split('\n').filter((t) => /Text sent|Recommendation|Rebooked|owner notes/.test(t));
  r.overflowAgents = await over(page);
  s = await st(page); const pid = (n) => s.people.find((x) => x.name === n).id; const outs = (n, re) => s.messages.filter((m) => m.personId === pid(n) && m.dir === 'out' && re.test(m.auto ?? '')).length;
  r.priyaEdited = s.messages.some((m) => m.personId === pid('Priya Nandakumar') && m.body.startsWith('Hi Priya! Edited'));
  r.laurenOffer = outs('Lauren Ochoa', /recommendation/); r.grant = { booking: s.bookings.filter((x) => x.personId === pid('Grant Foley')).map((x) => x.status), stage: s.leads.find((l) => l.personId === pid('Grant Foley')).stage, msgs: outs('Grant Foley', /rescheduled/) };
  await tap('[data-testid=reset]'); await page.waitForTimeout(300); s = await st(page);
  r.afterReset = { casey: s.people.some((x) => x.name === 'Casey Rivera'), agent: Object.keys(s.agent).length, chatMsgs: s.chat.msgs.length, pendingTab: await page.locator('[data-testid=tab-ai] i').innerText().catch(() => '0') };
  r.net = net.length; r.errs = errs; R['flow-' + name] = r; await ctx.close();
}
// E1 off-script: reset mid-typing and mid-action
{ const { ctx, page, net, errs } = await mk({ width: 390, height: 844 }, true); const r = {};
  await page.locator('[data-testid=chat-open]').tap(); await page.locator('[data-testid=qchip]').first().tap(); await page.waitForTimeout(200);
  r.typingVisible = await page.locator('[data-testid=typing]').count();
  await page.locator('[data-testid=chat-close]').tap(); await page.locator('[data-testid=reset]').tap(); await page.waitForTimeout(2500);
  let s = await st(page); r.resetMidTyping = { msgs: s.chat.msgs.length, queue: s.chat.queue.length };
  await page.locator('[data-testid=chat-open]').tap(); r.chipsBack = await page.locator('[data-testid=qchip]').count();
  await page.locator('[data-testid=chat-close]').tap();
  await page.locator('[data-testid=tab-ai]').tap(); await page.locator('[data-testid=agent-noshow] [data-testid=agent-approve]').tap(); await page.waitForTimeout(200);
  await page.locator('[data-testid=reset]').tap(); await page.waitForTimeout(2000); s = await st(page);
  r.resetMidAction = { agent: Object.keys(s.agent).length, grant: s.bookings.find((x) => x.id === 'B9').status, grantMsgs: s.messages.filter((m) => m.personId === 'seed9' && m.dir === 'out').length };
  // off-script: free text during booking + tapping stale chips + empty send
  await page.locator('[data-testid=chat-open]').tap(); await say(page, 'book'); await say(page, 'how much is it?'); r.offScriptMidBooking = (await st(page)).chat.msgs.slice(-2).some((m) => m.text.includes('$700'));
  r.staleChipButtons = await page.locator('.bubble.bot').nth(1).locator('[data-testid=qchip]').count();
  await page.locator('[data-testid=chat-send]').tap(); r.emptySendNoMsg = (await st(page)).chat.msgs.length;
  r.net = net.length; r.errs = errs; R.E1 = r; await ctx.close(); }
// E6 double taps: one booking, one action
{ const { ctx, page, net, errs } = await mk({ width: 390, height: 844 }, true); const r = {}; const dbl = (s) => page.locator(s).first().dblclick();
  await page.locator('[data-testid=chat-open]').tap(); await dbl('[data-testid=qchip] >> text=Book an assessment'); await settle(page);
  await dbl('[data-testid=qchip] >> text=Casey'); await settle(page); await dbl('[data-testid=qchip] >> text=/\\d:\\d\\d/'); await settle(page);
  await dbl('[data-testid=qchip] >> text=Talk to a coach'); await settle(page);
  let s = await st(page); const c = s.people.filter((x) => x.name === 'Casey Rivera');
  r.caseyPeople = c.length; r.caseyBookings = s.bookings.filter((x) => x.personId === c[0]?.id).length; r.confirmations = s.messages.filter((m) => /booked in chat/.test(m.auto ?? '')).length; r.handoffs = s.messages.filter((m) => /handoff/.test(m.auto ?? '')).length;
  r.userMsgs = s.chat.msgs.filter((m) => m.from === 'user').length;
  await page.locator('[data-testid=chat-close]').tap(); await page.locator('[data-testid=tab-ai]').tap();
  for (const k of ['reengage', 'recommend', 'noshow', 'summary']) await dbl(`[data-testid=agent-${k}] [data-testid=agent-approve]`);
  await page.waitForTimeout(2500); s = await st(page);
  r.agentEntries = Object.values(s.agent).map((e) => e.kind + ':' + e.status);
  r.agentMsgs = s.messages.filter((m) => /AI agent/.test(m.auto ?? '')).reduce((a, m) => ((a[m.auto] = (a[m.auto] || 0) + 1), a), {});
  r.grantBookings = s.bookings.filter((x) => x.personId === 'seed9').map((x) => x.status);
  await dbl('[data-testid=agent-recommend] [data-testid=agent-dismiss]').catch(() => {}); r.net = net.length; r.errs = errs; R.E6 = r; await ctx.close(); }
// E8 reload mid-chat (typing) and mid-action; persistence until reset
{ const { ctx, page, net, errs } = await mk({ width: 390, height: 844 }, true); const r = {};
  await page.locator('[data-testid=chat-open]').tap(); await page.locator('[data-testid=qchip] >> text=Prices').tap(); await page.waitForTimeout(150); await page.reload(); await page.waitForTimeout(3500);
  let s = await st(page); r.reloadMidTyping = { msgs: s.chat.msgs.length, queue: s.chat.queue.length, pricesDelivered: s.chat.msgs.some((m) => m.text.includes('$700')) };
  await page.locator('[data-testid=tab-ai]').tap(); await page.locator('[data-testid=agent-noshow] [data-testid=agent-approve]').tap(); await page.waitForTimeout(150); await page.reload(); await page.waitForTimeout(2500);
  s = await st(page); r.reloadMidAction = { entry: s.agent['ns:B9']?.status, grant: s.bookings.find((x) => x.id === 'B9').status, msgs: s.messages.filter((m) => m.personId === 'seed9' && /rescheduled/.test(m.auto ?? '')).length };
  await page.reload(); await page.locator('[data-testid=chat-open]').tap(); r.chatPersists = await page.locator('.bubble').count();
  await page.locator('[data-testid=chat-close]').tap(); await page.locator('[data-testid=tab-ai]').tap(); r.feedPersists = await page.locator('[data-testid=feed-noshow]').count();
  await page.locator('[data-testid=reset]').tap(); await page.waitForTimeout(300); s = await st(page); r.afterReset = { msgs: s.chat.msgs.length, agent: Object.keys(s.agent).length, grant: s.bookings.find((x) => x.id === 'B9').status };
  r.net = net.length; r.errs = errs; R.E8 = r; await ctx.close(); }
await b.close(); console.log(JSON.stringify(R, null, 1));
