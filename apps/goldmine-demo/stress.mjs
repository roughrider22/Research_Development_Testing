import { chromium } from 'playwright';
const file = 'file://' + process.cwd() + '/dist/index.html';
const b = await chromium.launch(); const R = {};
async function mk(o = {}) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, ...o });
  const page = await ctx.newPage(); const net = [], errs = [];
  page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) net.push(r.url()); });
  page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('dialog', (d) => d.accept());
  await page.goto(file); return { ctx, page, net, errs }; }
const T = (p, s) => p.locator(s).first().tap();
const count = (p, s) => p.locator(s).count();
const over = (p) => p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) > screen.width);
// E1 off-script + reset race
{ const { ctx, page, net, errs } = await mk(); const r = {};
  await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(300); await T(page, '[data-testid=reset]'); await page.waitForTimeout(2000);
  r.resetDuringReplyDelay_jordan = await count(page, '[data-testid=lead-Jordan]');
  await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(1800); await T(page, '[data-testid=lead-Jordan]'); await T(page, '[data-testid=book]'); await T(page, '[data-testid=slot]');
  await T(page, '[data-testid=tab-renew]'); r.renewWhileBooked_jordanCard = await count(page, '[data-testid=renew-Jordan]');
  await T(page, '[data-testid=tab-follow]'); r.followWhileBooked_text = (await page.locator('[data-testid=follow-Jordan]').innerText()).includes('Sequence starts');
  await T(page, '[data-testid=tab-dash]'); r.dashBooked = (await page.locator('.src-table tbody tr').first().innerText()).replace(/\s+/g, ' ');
  r.guide = await page.locator('[data-testid=guide] li.cur').innerText();
  await page.screenshot({ path: 'screens/stress-E1-offscript-dash.png' });
  await T(page, '[data-testid=reset]'); await page.waitForTimeout(300); r.afterReset_jordan = await count(page, '[data-testid=lead-Jordan]'); r.afterReset_guide = await page.locator('[data-testid=guide] li.cur').innerText();
  // sold early: skip sequence
  await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(1800); await T(page, '[data-testid=lead-Jordan]'); await T(page, '[data-testid=book]'); await T(page, '[data-testid=slot]'); await T(page, '[data-testid=assessed]'); await T(page, '[data-testid=go-follow]');
  await T(page, '[data-testid=follow-Jordan] [data-testid=sold]'); await T(page, '[data-testid=tab-renew]'); r.soldEarly_renewCard = await count(page, '[data-testid=renew-Jordan]');
  r.net = net.length; r.errs = errs; R.E1 = r; await ctx.close(); }
// E3 simulated labels on every send screen
{ const { ctx, page, errs } = await mk({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: true, deviceScaleFactor: 2 }); const r = {};
  await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(1800); await T(page, '[data-testid=lead-Jordan]'); await T(page, '[data-testid=book]'); await T(page, '[data-testid=slot]');
  await page.fill('.compose input', 'Test reply'); await T(page, '.compose button');
  const outs = await page.locator('.msg.out').count(); const outsSim = await page.locator('.msg.out .sim').count(); r.leadThread = `${outsSim}/${outs} outbound tagged simulated`;
  r.composePlaceholder = await page.locator('.compose input').getAttribute('placeholder');
  r.footer = await page.locator('footer').innerText(); r.pill = await page.locator('.demo-pill').innerText();
  await page.screenshot({ path: 'screens/stress-E3-labels.png' }); r.errs = errs; R.E3 = r; await ctx.close(); }
// E4 dashboard reply split
{ const { ctx, page } = await mk(); await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(1800); await T(page, '[data-testid=tab-dash]');
  R.E4 = { kpi: (await page.locator('.kpi').last().innerText()).replace(/\s+/g, ' '), overflow: await over(page) }; await page.locator('[data-testid=reply-split]').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'screens/stress-E4-reply-split.png' }); await ctx.close(); }
// E5 package list
{ const { ctx, page } = await mk(); await page.evaluate(() => 0);
  await T(page, '[data-testid=tab-follow]'); const opts = await page.locator('[data-testid=follow-Lauren] [data-testid=pkg] option').allInnerTexts();
  R.E5 = { options: opts, emptyOrNaN: opts.filter((o) => /NaN|undefined|\$0\b|— $/.test(o)).length, assessmentPriceShown: (await page.content()).match(/assessment[^<]{0,40}\$\d/i)?.[0] ?? null }; await ctx.close(); }
// E6 double taps
{ const { ctx, page, errs } = await mk(); const r = {}; const dbl = async (s) => { const l = page.locator(s).first(); await l.dblclick(); };
  await dbl('[data-testid=sim-lead]'); await page.waitForTimeout(1800); r.detailOpenAfterDouble = await count(page, '[data-testid=detail]');
  r.jordanLeads = await count(page, '[data-testid=lead-Jordan]'); await T(page, '[data-testid=tab-inbox]');
  await T(page, '[data-testid=lead-Jordan]'); await T(page, '[data-testid=book]'); await dbl('[data-testid=slot]');
  r.instantReplies = await page.locator('.msg.out >> text=Instant reply').count(); r.confirmations = await page.locator('.msg.out >> text=Booking confirmation').count();
  await dbl('[data-testid=assessed]'); r.thankYous = await page.locator('.msg.out >> text=Follow-up 1/4').count();
  await T(page, '[data-testid=go-follow]'); await dbl('[data-testid=follow-Jordan] [data-testid=run-seq]'); r.dbgFollow = (await page.locator('main').innerText()).slice(0,600); if (await count(page,'[data-testid=follow-Jordan] [data-testid=sold]')) await dbl('[data-testid=follow-Jordan] [data-testid=sold]');
  await T(page, '[data-testid=tab-renew]'); r.jordanRenewCards = await count(page, '[data-testid=renew-Jordan]');
  await T(page, '[data-testid=renew-Jordan] [data-testid=ff]'); await dbl('[data-testid=renew-Jordan] [data-testid=remind]'); await dbl('[data-testid=renew-Jordan] [data-testid=renewed]');
  r.jordanRenewCardsAfterRenew = await count(page, '[data-testid=renew-Jordan]');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('goldmine-demo-state-v2')));
  const pid = st.people.find((p) => p.name === 'Jordan Ellis').id; const ms = st.messages.filter((m) => m.personId === pid && m.dir === 'out');
  r.jordanSales = st.sales.filter((s) => s.personId === pid).length; r.outMsgsByLabel = ms.reduce((a, m) => ((a[m.auto ?? 'manual'] = (a[m.auto ?? 'manual'] || 0) + 1), a), {});
  await T(page, '[data-testid=tab-dash]'); r.webRow = (await page.locator('.src-table tbody tr').first().innerText()).replace(/\s+/g, ' ');
  r.kpis = (await page.locator('.kpis').innerText()).replace(/\s+/g, ' '); await page.screenshot({ path: 'screens/stress-E6-dash-after-doubles.png', fullPage: true }); r.errs = errs; R.E6 = r; await ctx.close(); }
// E7 offline / dark / landscape / large font
{ const out = {};
  for (const [n, o, pre] of [['offline', { offline: true }], ['dark', { colorScheme: 'dark' }], ['landscape', { viewport: { width: 844, height: 390 } }], ['small-android', { viewport: { width: 360, height: 740 } }], ['bigfont', {}, true]]) {
    const { ctx, page, net, errs } = await mk(o); if (pre) await page.addStyleTag({ content: 'html{font-size:125%} :root{font-size:20px}' });
    await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(1800); await T(page, '[data-testid=lead-Jordan]'); await page.waitForSelector('text=Instant reply');
    const ov1 = await over(page); await page.screenshot({ path: `screens/stress-E7-${n}-lead.png` });
    await T(page, '[data-testid=tab-dash]'); const ov2 = await over(page); await page.screenshot({ path: `screens/stress-E7-${n}-dash.png` });
    out[n] = { overflowLead: ov1, overflowDash: ov2, net: net.length, errs }; await ctx.close(); }
  R.E7 = out; }
// E8 reload mid-demo, incl. during reply delay
{ const { ctx, page, errs } = await mk(); const r = {};
  await T(page, '[data-testid=sim-lead]'); await page.waitForTimeout(200); await page.reload(); await page.waitForTimeout(2000);
  await T(page, '[data-testid=lead-Jordan]'); r.reloadDuringDelay_instantReply = await page.locator('.msg.out >> text=Instant reply').count();
  await T(page, '[data-testid=book]'); await T(page, '[data-testid=slot]'); await page.reload();
  r.afterReload_stage = await page.locator('[data-testid=lead-Jordan] .stage').innerText(); r.afterReload_guide = await page.locator('[data-testid=guide] li.cur').innerText();
  const p2 = await ctx.newPage(); await p2.goto(file); r.newTabSameState = await p2.locator('[data-testid=lead-Jordan] .stage').innerText();
  r.errs = errs; R.E8 = r; await ctx.close(); }
// E10 sleep: fake a long pause via clock jump
{ const { ctx, page, errs } = await mk(); await page.clock.install(); await page.reload();
  await T(page, '[data-testid=sim-lead]'); await page.clock.fastForward('08:00:00'); await page.waitForTimeout(200);
  await T(page, '[data-testid=lead-Jordan]'); R.E10 = { instantReplyAfterSleep: await page.locator('.msg.out >> text=Instant reply').count(), ago: await page.locator('[data-testid=lead-Jordan] .meta small').innerText(), errs }; await ctx.close(); }
// E9 logo
{ const { ctx, page } = await mk(); R.E9 = await page.evaluate(() => { const i = document.querySelector('.logo'); return { natural: i.naturalWidth + 'x' + i.naturalHeight, shown: i.clientWidth + 'x' + i.clientHeight, dpr3Needs: i.clientWidth * 3 }; });
  R.E9.mindbodyMentions = (await page.content()).match(/Mindbody[^<]{0,20}/g); await page.screenshot({ path: 'screens/stress-E9-logo-3x.png', clip: { x: 0, y: 0, width: 390, height: 70 } }); await ctx.close(); }
await b.close(); console.log(JSON.stringify(R, null, 1));
