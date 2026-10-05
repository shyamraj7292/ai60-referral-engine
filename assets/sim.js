/*
 * AI60 campaign simulator.
 *
 * Generates a synthetic 7-day campaign from the growth plan's assumptions, in the same
 * data shape the live backend returns, so the dashboard and its decision rules can be
 * exercised before a single real student signs up. Everything here is SIMULATED and
 * labelled as such in the UI.
 *
 * Scripted scenarios baked in, so every decision rule has something to fire on:
 *   - the Telegram shout-out under-performs (kill), the Instagram one works (scale + reserve)
 *   - 3 recruited champions never forward (inactive)
 *   - day 4 referral push lifts sharing
 *   - one student games referrals with throwaway emails on day 4 (burst review)
 */
var AI60Sim = (function () {
  'use strict';
  var E = typeof AI60 !== 'undefined' ? AI60 : require('./engine.js');

  var DEFAULTS = { champions: 20, reach: 300, ctr: 0.10, cvr: 0.35, shareRate: 0.25, perSharer: 1.2 };

  // Share of each source's sign-ups landing on each campaign day (plan timeline).
  var SCHED = {
    champion: [0.08, 0.30, 0.17, 0.08, 0.22, 0.10, 0.05], // wave 1 on day 2, wave 2 on day 5
    club: [0, 0.05, 0.40, 0.20, 0.15, 0.10, 0.10],          // club announcements on day 3
    tg: [0, 0.70, 0.30, 0, 0, 0, 0],                         // killed after day 3
    ig: [0, 0.45, 0.25, 0.05, 0, 0.25, 0],                   // reserve boost on day 6
    owned: [0.35, 0.20, 0.10, 0.10, 0.10, 0.10, 0.05]
  };

  var FIRST = ['Aarav', 'Abhinav', 'Aditya', 'Akhil', 'Akshay', 'Ananya', 'Anjali', 'Anusha', 'Arjun', 'Ayesha',
    'Bhavana', 'Charan', 'Deepika', 'Divya', 'Farhan', 'Gayathri', 'Harika', 'Harsha', 'Hemanth', 'Imran',
    'Jahnavi', 'Karthik', 'Keerthi', 'Krishna', 'Lakshmi', 'Likhitha', 'Mahesh', 'Manasa', 'Meghana', 'Mounika',
    'Naveen', 'Nikhil', 'Niharika', 'Pavan', 'Pooja', 'Pranav', 'Prasanna', 'Priya', 'Rahul', 'Rakesh',
    'Ramya', 'Ravi', 'Rohith', 'Sahithi', 'Sai', 'Sameer', 'Sandeep', 'Sanjana', 'Shreya', 'Shruthi',
    'Siddharth', 'Sneha', 'Sravani', 'Srikanth', 'Swathi', 'Tarun', 'Tejaswini', 'Vamsi', 'Varun', 'Vishnu',
    'Yamini', 'Yashwanth', 'Zoya'];
  var LAST = ['Reddy', 'Rao', 'Sharma', 'Naidu', 'Kumar', 'Varma', 'Goud', 'Chowdary', 'Patel', 'Iyer', 'Nair',
    'Gupta', 'Khan', 'Shaik', 'Yadav', 'Mehta', 'Joshi', 'Pillai', 'Das', 'Singh', 'Verma', 'Bhat', 'Kulkarni', 'Menon'];
  var COLLEGES = [['CBIT Hyderabad', 8], ['VNR VJIET', 8], ['GRIET', 7], ['Sreenidhi Institute (SNIST)', 6],
    ['MLR Institute of Technology', 6], ['Vardhaman College of Engineering', 6], ['Malla Reddy Engineering College', 6],
    ['KL University', 6], ['CVR College of Engineering', 5], ['MGIT', 5], ['Vignan University', 5], ['Anurag University', 5],
    ['CMR College of Engineering', 5], ['GITAM Hyderabad', 4], ['VIT-AP', 4], ['Geethanjali College', 4],
    ['JNTUH College of Engineering', 4], ['Aditya Engineering College', 4], ['BVRIT', 4], ['SRM AP', 3],
    ['Keshav Memorial', 3], ['GMR Institute of Technology', 3], ['RVR & JC', 3], ['ACE Engineering College', 3],
    ["St. Martin's Engineering College", 3], ['Methodist College', 2], ['Matrusri Engineering College', 2], ['Sri Indu College', 2]];
  var CLUBS = [['AI Club', 'GRIET'], ['Coding Club', 'MLR Institute of Technology'], ['Tech Society', 'CVR College of Engineering'],
    ['Developer Club', 'Anurag University'], ['ML Club', 'Vardhaman College of Engineering']];
  var BRANCH_W = [['CSE', 38], ['IT', 10], ['AI & DS / AI & ML', 10], ['ECE', 18], ['EEE', 8], ['Mechanical', 9], ['Civil', 5], ['Other', 2]];
  var PROJECT_W = [['resume', 42], ['quiz', 28], ['buddy', 18], ['unsure', 12]];
  // Sign-ups by IST hour: students are on their phones at lunch and late evening.
  var HOUR_W = [[0, 1], [7, 2], [8, 4], [9, 4], [10, 3], [11, 3], [12, 4], [13, 4], [14, 3], [15, 3], [16, 3], [17, 4],
    [18, 6], [19, 8], [20, 9], [21, 9], [22, 7], [23, 3]];
  // Probability a sign-up from this source is NOT final-year.
  var JUNIOR = { champion: 0.06, club: 0.12, tg: 0.38, ig: 0.18, referral: 0.08, owned: 0.10, direct: 0.15 };

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
  function pickW(rand, pairs) {
    var sum = 0, i;
    for (i = 0; i < pairs.length; i++) sum += pairs[i][1];
    var x = rand() * sum;
    for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  function poisson(rand, lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }
  function normal(rand) {
    var u = Math.max(rand(), 1e-9), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function merge(a, b) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { if (b[k] != null && !isNaN(b[k])) o[k] = Number(b[k]); });
    return o;
  }

  function generate(params, opts) {
    var P = merge(DEFAULTS, params);
    opts = opts || {};
    var rand = rng(opts.seed || 4);
    var start = opts.startDate || E.dayKey(Date.now());
    var regs = [], visits = [], partners = [];
    var taken = {};
    var isTaken = function (c) { return !!taken[c]; };
    var session = 0;

    function iso(day, hour, minute) {
      return new Date(E.istTime(E.addDays(start, day - 1), hour, minute)).toISOString();
    }
    function randomTime(day) {
      return iso(day, pickW(rand, HOUR_W), Math.floor(rand() * 60));
    }
    function addPartner(type, name, org, cost, day, hour) {
      var code = E.makePartnerCode(type, isTaken, rand);
      taken[code] = 1;
      var p = { createdAt: iso(day, hour, 0), code: code, name: name, org: org, type: type, cost: cost };
      partners.push(p);
      return p;
    }
    function person() { return pick(rand, FIRST) + ' ' + pick(rand, LAST); }
    function addVisit(ts, p, channel, source, medium) {
      visits.push({ ts: ts, session: 's' + (++session), ref: p ? p.code : '', channel: channel,
        source: source || '', medium: medium || '', campaign: 'ai60' });
    }
    function addReg(ts, info) {
      var name = info.name || person();
      var parts = name.toLowerCase().split(' ');
      var juniorP = JUNIOR[info.mix] == null ? 0.1 : JUNIOR[info.mix];
      var gradYear = rand() < juniorP ? pickW(rand, [[2028, 70], [2026, 20], [2029, 10]]) : E.FINAL_YEAR;
      var code = E.makeCode(name, isTaken, rand);
      taken[code] = 1;
      var r = {
        createdAt: ts, code: code, name: name,
        phone: String(6 + Math.floor(rand() * 4)) + String(Math.floor(rand() * 1e9) + 1e9).slice(1),
        email: info.email || (parts[0] + '.' + parts[1] + Math.floor(rand() * 90 + 10) + '@gmail.com'),
        college: info.college || pickW(rand, COLLEGES),
        branch: pickW(rand, BRANCH_W), gradYear: gradYear, project: pickW(rand, PROJECT_W),
        referredBy: info.ref || '', channel: info.channel, source: info.source || '', medium: info.medium || '',
        campaign: 'ai60', flags: info.flags || ''
      };
      regs.push(r);
      return r;
    }

    // ---- partners, recruited the way the plan says ----
    var champs = [];
    for (var i = 0; i < P.champions + 3; i++) {
      var c = addPartner('champion', person(), pickW(rand, COLLEGES), 0, 1, 9 + (i % 5));
      c._w = i < P.champions ? Math.exp(normal(rand) * 0.6) : 0; // last 3 never forward
      champs.push(c);
    }
    var clubs = CLUBS.map(function (cl) {
      var p = addPartner('club', cl[0] + ' – ' + cl[1], cl[1], 0, 2, 10);
      p._w = 0.6 + rand();
      return p;
    });
    var tg = addPartner('paid', 'Telegram shout-out', '2027-batch off-campus updates channel', 400, 2, 11);
    var ig = addPartner('paid', 'Instagram story', 'Placement-prep page', 400, 2, 11);
    var owned = addPartner('owned', 'My LinkedIn + network', 'Owned', 0, 1, 8);
    function weightsOf(list) {
      var s = list.reduce(function (a, p) { return a + p._w; }, 0) || 1;
      return list.map(function (p) { return [p, p._w / s]; });
    }
    var champW = weightsOf(champs), clubW = weightsOf(clubs);

    // ---- expected volumes from the plan's assumptions ----
    var clubCvr = Math.min(0.9, P.cvr + 0.05), tgCvr = Math.max(0.04, P.cvr - 0.25), igCvr = Math.max(0.05, P.cvr - 0.08);
    var src = [
      { key: 'champion', mix: 'champion', channel: 'champion', medium: 'champion', source: 'whatsapp',
        visits: P.champions * P.reach * P.ctr, cvr: P.cvr, weights: champW },
      { key: 'club', mix: 'club', channel: 'club', medium: 'club', source: 'club', visits: 200, cvr: clubCvr, weights: clubW },
      { key: 'tg', mix: 'tg', channel: 'paid', medium: 'paid', source: 'telegram', visits: 110, cvr: tgCvr, weights: [[tg, 1]] },
      { key: 'ig', mix: 'ig', channel: 'paid', medium: 'paid', source: 'instagram', visits: 190, cvr: igCvr, weights: [[ig, 1]] },
      { key: 'owned', mix: 'owned', channel: 'owned', medium: 'social', source: 'linkedin', visits: 57, cvr: P.cvr, weights: [[owned, 1]] }
    ];

    var pending = [[], [], [], [], [], [], [], [], [], []];
    function maybeShare(r, day) {
      var s = P.shareRate * (day >= 4 ? 1.25 : 0.8); // day-4 referral push
      if (rand() >= s) return;
      // a few students are super-sharers; mean stays at perSharer
      var n = poisson(rand, P.perSharer * Math.exp(normal(rand) * 0.8) / 1.377);
      for (var j = 0; j < n; j++) {
        var off = pickW(rand, [[0, 45], [1, 35], [2, 20]]);
        if (day + off <= 7) pending[day + off].push(r);
      }
    }

    for (var day = 1; day <= 7; day++) {
      var dayRegs = [];
      src.forEach(function (s) {
        s.weights.forEach(function (pw) {
          var p = pw[0], share = pw[1] * SCHED[s.key][day - 1];
          if (!share || Date.parse(p.createdAt) > E.istTime(E.addDays(start, day - 1), 23, 59)) return;
          var v = poisson(rand, s.visits * share);
          for (var k = 0; k < v; k++) {
            var ts = randomTime(day);
            if (Date.parse(ts) < Date.parse(p.createdAt)) ts = new Date(Date.parse(p.createdAt) + (k + 1) * 60000).toISOString();
            addVisit(ts, p, s.channel, s.source, s.medium);
            if (rand() < s.cvr) {
              var college = (s.channel === 'champion' && rand() < 0.75) || (s.channel === 'club' && rand() < 0.85) ? p.org : null;
              dayRegs.push(addReg(ts, { channel: s.channel, mix: s.mix, ref: p.code, college: college, source: s.source, medium: s.medium }));
            }
          }
        });
      });
      // a trickle of direct traffic
      var dv = poisson(rand, 8);
      for (var q = 0; q < dv; q++) {
        var dts = randomTime(day);
        addVisit(dts, null, 'direct');
        if (rand() < 0.25) dayRegs.push(addReg(dts, { channel: 'direct', mix: 'direct' }));
      }
      dayRegs.forEach(function (r) { maybeShare(r, day); });

      // referrals landing today (including chains started today)
      var dayEnd = E.istTime(E.addDays(start, day - 1), 23, 59);
      for (var qi = 0; qi < pending[day].length; qi++) {
        var referrer = pending[day][qi];
        var t0 = Math.max(Date.parse(referrer.createdAt) + 10 * 60000, E.istTime(E.addDays(start, day - 1), 7, 0));
        var t = Date.parse(randomTime(day));
        if (t < t0) t = t0 + rand() * Math.max(0, dayEnd - t0);
        if (t > dayEnd) { if (day < 7) pending[day + 1].push(referrer); continue; }
        var rts = new Date(t).toISOString();
        addVisit(rts, { code: referrer.code }, 'referral', 'whatsapp', 'referral');
        for (var x = poisson(rand, 0.8); x > 0; x--) addVisit(randomTime(day), { code: referrer.code }, 'referral', 'whatsapp', 'referral');
        var rr = addReg(rts, { channel: 'referral', mix: 'referral', ref: referrer.code,
          college: rand() < 0.7 ? referrer.college : null, source: 'whatsapp', medium: 'referral' });
        maybeShare(rr, day);
      }

      // day 4, 10:10 PM: one student games the referral loop with throwaway emails
      if (day === 4) {
        var earlier = regs.filter(function (r) { return E.dayKey(r.createdAt) <= E.addDays(start, 2) && r.channel !== 'referral'; });
        var gamer = earlier[Math.floor(rand() * earlier.length)];
        if (gamer) {
          for (var g = 0; g < 6; g++) {
            var gts = iso(4, 22, 10 + g + Math.floor(rand() * 2));
            addVisit(gts, { code: gamer.code }, 'referral', 'whatsapp', 'referral');
            var gname = person();
            addReg(gts, { channel: 'referral', mix: 'referral', ref: gamer.code, college: gamer.college, name: gname,
              email: gname.toLowerCase().replace(/[^a-z]/g, '') + g + (g % 2 ? '@yopmail.com' : '@gmail.com'),
              flags: g % 2 ? 'disposable-email' : '', source: 'whatsapp', medium: 'referral' });
          }
        }
      }
    }

    // the Instagram reserve top-up happens on day 6
    if (!opts.asOfDay || opts.asOfDay >= 6) ig.cost = 400 + 200;
    partners.forEach(function (p) { delete p._w; });
    var byTime = function (k) { return function (a, b) { return Date.parse(a[k]) - Date.parse(b[k]); }; };
    return { regs: regs.sort(byTime('createdAt')), visits: visits.sort(byTime('ts')), partners: partners, start: start, params: P };
  }

  // Mean and range of the day-7 total across seeds, for the projection readout.
  function project(params, seeds) {
    seeds = seeds || 8;
    var totals = [], base = 0, referral = 0;
    for (var s = 1; s <= seeds; s++) {
      var d = generate(params, { seed: 100 + s, startDate: '2026-10-12' });
      totals.push(d.regs.length);
      var ref = d.regs.filter(function (r) { return r.channel === 'referral'; }).length;
      referral += ref;
      base += d.regs.length - ref;
    }
    var mean = totals.reduce(function (a, b) { return a + b; }, 0) / seeds;
    return { mean: Math.round(mean), min: Math.min.apply(null, totals), max: Math.max.apply(null, totals),
      base: Math.round(base / seeds), referral: Math.round(referral / seeds) };
  }

  return { DEFAULTS: DEFAULTS, generate: generate, project: project };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AI60Sim;
