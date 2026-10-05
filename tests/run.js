// Run: node tests/run.js   (builds Code.gs first, then tests the engine and the Apps Script backend)
const test = require('node:test');
const assert = require('node:assert/strict');
require('../tools/build-gas.js');
const E = require('../assets/engine.js');
const Sim = require('../assets/sim.js');
const { loadGas } = require('../tools/gas-mock.js');

const PLAN = [30, 145, 250, 325, 415, 490, 540];
const T0 = '2026-10-12T06:00:00.000Z';
const student = (over) => Object.assign({
  name: 'Ananya Rao', phone: '+91 98765 43210', email: 'ananya@example.com', college: 'CBIT Hyderabad',
  branch: 'CSE', gradYear: '2027', project: 'resume'
}, over);

test('validate normalises Indian numbers and rejects bad input', () => {
  const ok = E.validate(student());
  assert.equal(ok.ok, true);
  assert.equal(ok.value.phone, '9876543210');
  const bad = E.validate(student({ phone: '12345', email: 'nope', name: '' }));
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['email', 'name', 'phone']);
});

test('register issues a code, dedupes by phone or email, and blocks the honeypot', () => {
  const s = { regs: [], partners: [] };
  const a = E.register(s, student(), T0);
  assert.equal(a.ok, true);
  assert.match(a.me.code, /^ANAN[A-Z2-9]{3}$/);
  const again = E.register(s, student({ email: 'other@example.com' }), T0);
  assert.equal(again.existing, true);
  assert.equal(again.me.code, a.me.code);
  assert.equal(s.regs.length, 1);
  assert.equal(E.register(s, student({ phone: '9000000001', email: 'x@y.com', website: 'spam' }), T0).ok, false);
});

test('attribution: partner link beats student link beats UTM', () => {
  const s = { regs: [], partners: [] };
  const champ = E.createPartner(s, { name: 'Rahul K', org: 'CBIT', type: 'champion' }, T0).partner;
  assert.match(champ.code, /^CH-[A-Z2-9]{4}$/);
  const a = E.register(s, student({ ref: champ.code.toLowerCase() }), T0);
  assert.equal(s.regs[0].channel, 'champion');
  E.register(s, student({ name: 'Kiran M', phone: '9123456780', email: 'k@example.com', ref: a.me.code }), T0);
  assert.equal(s.regs[1].channel, 'referral');
  E.register(s, student({ name: 'Lata P', phone: '9123456781', email: 'l@example.com', utm: { medium: 'paid', source: 'instagram' } }), T0);
  assert.equal(s.regs[2].channel, 'paid');
  assert.equal(E.me(s, a.me.code).referrals, 1);
  assert.equal(E.me(s, a.me.code).rank, 1);
});

test('throwaway emails are flagged and never count toward rewards', () => {
  const s = { regs: [], partners: [] };
  const a = E.register(s, student(), T0);
  E.register(s, student({ name: 'Fake One', phone: '9123456789', email: 'f1@yopmail.com', ref: a.me.code }), T0);
  assert.equal(s.regs[1].flags, 'disposable-email');
  assert.equal(E.me(s, a.me.code).referrals, 0);
});

test('public stats never expose phone numbers or emails', () => {
  const s = { regs: [], partners: [] };
  const a = E.register(s, student(), T0);
  E.register(s, student({ name: 'Kiran Mehta', phone: '9123456780', email: 'kiran@example.com', ref: a.me.code }), T0);
  const json = JSON.stringify(E.stats(s));
  assert.ok(!json.includes('9876543210') && !json.includes('@example.com'));
  assert.equal(E.stats(s).topReferrers[0].name, 'Ananya R.');
});

test('CSV export neutralises spreadsheet formulas', () => {
  const csv = E.toCSV([{ name: '=HYPERLINK("http://evil")', n: 'a,b' }], ['name', 'n']);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
  assert.ok(csv.includes('"a,b"'));
});

test('simulated campaign: the plan clears 500 on average', () => {
  const p = Sim.project(Sim.DEFAULTS);
  assert.ok(p.mean >= 500, 'mean ' + p.mean);
});

test('decision rules fire on the scripted scenarios', () => {
  const at = (day) => E.analyze(Sim.generate({}, { startDate: '2026-10-12', asOfDay: day }),
    { campaignStart: '2026-10-12', planTargets: PLAN, asOfDay: day });
  const d3 = at(3).recommendations.map((r) => r.title).join('\n');
  assert.match(d3, /^Kill Telegram/m);
  assert.match(d3, /^Scale Instagram/m);
  assert.match(d3, /partners have 0 sign-ups/);
  const d4 = at(4);
  assert.ok(d4.recommendations.some((r) => r.level === 'critical' && /^Review .* before rewards/.test(r.title)));
  const d7 = at(7);
  assert.ok(d7.kpis.total >= 500, 'day-7 total ' + d7.kpis.total);
  assert.ok(!d7.recommendations.some((r) => /^Scale/.test(r.title)), 'no reserve advice after the last day');
});

test('live pace check is pro-rated to the hour', () => {
  const regs = Array.from({ length: 10 }, (_, i) => ({ createdAt: '2026-10-12T0' + (i % 6) + ':00:00.000Z', code: 'X' + i, channel: 'direct', gradYear: 2027 }));
  const noon = E.analyze({ regs }, { campaignStart: '2026-10-12', planTargets: PLAN, now: '2026-10-12T06:30:00.000Z' }); // 12:00 IST
  assert.equal(noon.kpis.target, 15);
});

test('Apps Script backend: register, dedupe, stats, admin, partners', () => {
  const g = loadGas();
  const key = g.setup();
  assert.equal(key.length, 16);
  assert.deepEqual(Object.keys(g.sheets).sort(), ['Partners', 'Registrations', 'Visits']);

  assert.equal(g.call.post({ action: 'admin', key: 'wrong' }).ok, false);
  assert.equal(g.call.post({ action: 'partner', key: 'wrong', name: 'X' }).ok, false);
  const champ = g.call.post({ action: 'partner', key, name: 'Rahul K', org: 'CBIT', type: 'champion' }).partner;

  g.call.post({ action: 'visit', session: 's1', ref: champ.code, utm: { medium: 'champion' } });
  const a = g.call.post(Object.assign({ action: 'register', ref: champ.code }, student()));
  assert.equal(a.ok, true);
  assert.equal(g.call.get({ action: 'stats' }).total, 1);
  const dup = g.call.post(Object.assign({ action: 'register' }, student()));
  assert.equal(dup.existing, true);

  const b = g.call.post(Object.assign({ action: 'register', ref: a.me.code }, student({ name: '=HYPERLINK("x")', phone: '9123456780', email: 'b@example.com' })));
  assert.equal(b.ok, true);
  assert.equal(g.sheets.Registrations.formulas, 0, 'no formula reached the sheet');
  assert.equal(g.call.get({ action: 'stats' }).total, 2, 'stats cache cleared on register');
  assert.equal(g.call.get({ action: 'me', code: a.me.code }).referrals, 1);
  assert.deepEqual(g.call.get({ action: 'ref', code: a.me.code }), { ok: true, kind: 'student', label: 'Ananya', org: 'CBIT Hyderabad' });

  const admin = g.call.post({ action: 'admin', key });
  assert.equal(admin.regs.length, 2);
  assert.equal(admin.regs[0].channel, 'champion');
  assert.equal(admin.regs[1].name, '=HYPERLINK("x")');
  assert.equal(admin.regs[0].phone, '9876543210');
  assert.equal(admin.visits[0].channel, 'champion');
  const a2 = E.analyze(admin, { planTargets: PLAN });
  assert.equal(a2.partners[0].total, 2, 'champion credited with the direct and the loop sign-up');
});
