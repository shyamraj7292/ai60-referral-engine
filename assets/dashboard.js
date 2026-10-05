/* Growth console: live or simulated data → analytics → decisions, charts and tables. */
(function () {
  'use strict';
  var cfg = window.AI60_CONFIG;
  var E = window.AI60, API = window.AI60API, C = window.AI60Charts, Sim = window.AI60Sim;
  var $ = function (id) { return document.getElementById(id); };
  var SIM_START = '2026-10-12';
  var KEY = 'ai60-admin-key';
  var COLORS = { champion: 'var(--s1)', club: 'var(--s2)', referral: 'var(--s3)', paid: 'var(--s4)', owned: 'var(--s5)', direct: 'var(--s6)' };
  var STATUS = { top: 'Top', active: 'Active', inactive: 'Inactive', learning: 'Learning', kill: 'Kill', scale: 'Scale', watch: 'Watch', review: 'Review' };
  var LEVEL = { critical: 'Act now', warning: 'Fix', good: 'Good', info: 'Opportunity' };
  var ICON = {
    critical: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>',
    warning: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l6.5 12H1.5z"/><path d="M8 6.5v3.2M8 12h.01"/></svg>',
    good: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5V11M8 5h.01"/></svg>'
  };
  var SLIDERS = [
    { k: 'champions', label: 'Active student champions', min: 5, max: 40, step: 1, f: String, hint: 'Each forwards to ~2 batch/placement groups' },
    { k: 'reach', label: 'Students reached per champion', min: 100, max: 600, step: 25, f: String, hint: '2 WhatsApp groups ≈ 300 students' },
    { k: 'ctr', label: 'Click-through on forwards', min: 0.02, max: 0.2, step: 0.01, f: pct, hint: 'Peer forward in a placement group' },
    { k: 'cvr', label: 'Sign-up page conversion', min: 0.15, max: 0.6, step: 0.01, f: pct, hint: '4 fields, mobile-first' },
    { k: 'shareRate', label: 'Sign-ups who share their link', min: 0.05, max: 0.5, step: 0.01, f: pct, hint: 'Lifted by the day-4 reward push' },
    { k: 'perSharer', label: 'Sign-ups per sharer', min: 0.5, max: 2.5, step: 0.1, f: function (v) { return v.toFixed(1); }, hint: 'k = share rate × sign-ups per sharer' }
  ];

  var state = { src: 'sim', day: 7, params: Object.assign({}, Sim.DEFAULTS), live: null, analysis: null, showAllPartners: false };

  function pct(x) { return x == null || !isFinite(x) ? '–' : Math.round(x * 100) + '%'; }
  function n(x) { return x == null ? '–' : Math.round(x).toLocaleString('en-IN'); }
  function rs(x) { return x == null ? '–' : (isFinite(x) ? '₹' + Math.round(x).toLocaleString('en-IN') : 'no sign-ups'); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dayTitle(s) {
    return 'Day ' + s.day + ' · ' + new Date(s.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copy(text, msg) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg || 'Copied'); });
    else { var ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copied'); } catch (e) { /* ignore */ } ta.remove(); }
  }
  function siteUrl() {
    if (cfg.SITE_URL) return cfg.SITE_URL.replace(/[?#].*$/, '');
    return new URL('index.html', location.href).href.replace(/[?#].*$/, '');
  }

  // ---------- data ----------
  function load() {
    if (state.src === 'sim') {
      var data = Sim.generate(state.params, { startDate: SIM_START, asOfDay: state.day });
      return Promise.resolve({ data: data, opts: { campaignStart: SIM_START, asOfDay: state.day } });
    }
    if (API.mode === 'live') {
      var key = sessionGet(KEY);
      if (!key) return Promise.resolve(null);
      return API.admin(key).then(function (res) {
        if (!res || !res.ok) { sessionDel(KEY); throw new Error((res && res.error) || 'Wrong admin key'); }
        return { data: res, opts: { campaignStart: API.campaignStart() } };
      });
    }
    return API.admin('').then(function (res) { return { data: res, opts: { campaignStart: API.campaignStart() } }; });
  }
  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function sessionDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function refresh() {
    return load().then(function (got) {
      var needKey = !got;
      $('gate').hidden = !needKey;
      $('board').hidden = needKey;
      renderBanner();
      if (needKey) return;
      var a = E.analyze(got.data, Object.assign({
        goal: cfg.GOAL, planTargets: cfg.PLAN_TARGETS, finalYear: cfg.FINAL_YEAR, reserve: cfg.RESERVE_BUDGET
      }, got.opts));
      state.analysis = a;
      render(a);
    }).catch(function (err) {
      $('gate').hidden = false;
      $('board').hidden = true;
      $('gateErr').textContent = err.message;
      $('gateErr').hidden = false;
    });
  }

  // ---------- header / banner ----------
  function renderBanner() {
    var b = $('banner');
    b.textContent = '';
    var sim = state.src === 'sim';
    $('srcSim').setAttribute('aria-pressed', String(sim));
    $('srcLive').setAttribute('aria-pressed', String(!sim));
    $('dayCtl').hidden = !sim;
    $('simPanel').hidden = !sim;
    $('newPartner').disabled = sim;
    $('newPartner').title = sim ? 'Switch to live data to create real partner links' : '';
    if (sim) {
      b.className = 'banner sim';
      b.appendChild(el('b', null, 'Simulated campaign. '));
      b.appendChild(document.createTextNode('Synthetic sign-ups generated from the growth plan\'s assumptions, to show how the console steers the 7 days. Drag "As of day" to replay it. No real students.'));
    } else if (API.mode === 'demo') {
      b.className = 'banner demo';
      b.appendChild(el('b', null, 'Demo store. '));
      b.appendChild(document.createTextNode('Sample data kept in this browser (opens on day 4), plus anything you register on the sign-up page. Connect the Google Sheet backend in config.js for shared live data. '));
      var reset = el('button', 'linklike', 'Reset demo data');
      reset.type = 'button';
      reset.onclick = function () { API.resetDemo(); refresh(); toast('Demo data reset'); };
      b.appendChild(reset);
    } else {
      b.className = 'banner';
      b.appendChild(el('b', null, 'Live. '));
      b.appendChild(document.createTextNode('Connected to the Google Sheet backend. Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '. '));
      var r = el('button', 'linklike', 'Refresh');
      r.type = 'button'; r.onclick = refresh;
      b.appendChild(r);
    }
  }

  // ---------- render ----------
  function render(a) {
    renderKpis(a);
    renderRecs(a);
    renderCharts(a);
    renderChannels(a);
    renderPartners(a);
    renderReferrers(a);
    renderColleges(a);
    renderMix(a);
    if (state.src === 'sim') renderProjection();
  }

  function kpi(parent, label, value, detail, cls, hero) {
    var d = el('div', 'kpi' + (hero ? ' kpi-hero' : ''));
    d.appendChild(el('div', 'lbl', label));
    var v = el('div', 'val');
    if (typeof value === 'string') v.textContent = value; else v.appendChild(value);
    d.appendChild(v);
    if (hero) {
      var m = el('div', 'meter'); var i = el('i'); i.style.width = Math.min(100, hero * 100) + '%'; m.appendChild(i); d.appendChild(m);
    }
    if (detail) d.appendChild(el('div', 'dl' + (cls ? ' ' + cls : ''), detail));
    parent.appendChild(d);
  }
  function renderKpis(a) {
    var k = a.kpis, box = $('kpis');
    box.textContent = '';
    $('goalText').textContent = n(k.goal);
    var hv = document.createDocumentFragment();
    hv.appendChild(document.createTextNode(n(k.total) + ' '));
    hv.appendChild(el('small', null, '/ ' + n(k.goal)));
    kpi(box, 'Sign-ups', hv, pct(k.progress) + ' of goal · day ' + k.day + ' of ' + k.days, null, Math.max(0.005, k.progress));
    var vs = k.vsPlan;
    kpi(box, 'Vs plan', vs == null ? '–' : (vs >= 0 ? '+' : '−') + Math.abs(Math.round(vs * 100)) + '%',
      k.target == null ? 'No plan target' : n(k.target) + ' planned by ' + (state.src === 'sim' ? 'end of day ' + k.day : 'now'),
      vs == null ? '' : vs >= 0 ? 'up' : vs < -0.1 ? 'down' : '');
    kpi(box, 'Today', n(k.today), k.yesterday == null ? 'First day' : 'Yesterday: ' + n(k.yesterday));
    kpi(box, 'Viral coefficient (k)', k.k.toFixed(2), n(k.referralRegs) + ' sign-ups via friends', k.k >= 0.25 ? 'up' : '');
    kpi(box, 'Page conversion', pct(k.cvr), n(k.visits) + ' visits');
    kpi(box, '₹ per sign-up', k.costPerSignup == null ? '–' : '₹' + k.costPerSignup.toFixed(1), rs(k.spend) + ' of ₹2,000 spent');
  }

  function renderRecs(a) {
    var ul = $('recs');
    ul.textContent = '';
    if (!a.recommendations.length) { ul.appendChild(el('li', 'rec', 'Not enough data yet. Rules start firing after the first sign-ups.')); return; }
    a.recommendations.forEach(function (r) {
      var li = el('li', 'rec');
      var tag = el('span', 'tag ' + r.level);
      tag.innerHTML = ICON[r.level]; // static markup, no data
      tag.appendChild(document.createTextNode(LEVEL[r.level]));
      li.appendChild(tag);
      li.appendChild(el('div', 't', r.title));
      li.appendChild(el('div', 'a', r.action));
      if (r.detail) li.appendChild(el('div', 'd', r.detail));
      ul.appendChild(li);
    });
  }

  function renderCharts(a) {
    var s = a.series;
    C.line($('chartCum'), {
      labels: s.map(function (d) { return 'D' + d.day; }),
      goal: a.kpis.goal,
      aria: 'Cumulative sign-ups versus plan by campaign day',
      legendEl: $('legCum'),
      titleOf: function (i) { return dayTitle(s[i]); },
      series: [
        { name: 'Plan', color: 'var(--plan)', values: s.map(function (d) { return d.plan; }) },
        { name: 'Actual', color: 'var(--s1)', values: s.map(function (d) { return d.cum; }), area: true, endLabel: true }
      ],
      extraRows: function (i) {
        if (s[i].cum == null || s[i].plan == null) return [];
        var d = s[i].cum - s[i].plan;
        return [{ name: 'Gap', value: (d >= 0 ? '+' : '−') + Math.abs(d) }];
      }
    });
    var shown = s.filter(function (d) { return d.cum != null; });
    C.stacked($('chartDaily'), {
      labels: shown.map(function (d) { return 'D' + d.day; }),
      keys: E.CHANNELS, colors: COLORS, names: E.CHANNEL_LABELS,
      data: shown.map(function (d) { return d.by; }),
      legendEl: $('legDaily'),
      aria: 'Daily sign-ups by channel',
      titleOf: function (i) { return dayTitle(shown[i]); }
    });
  }

  function table(id, head, rows) {
    var t = $(id);
    t.textContent = '';
    var thead = el('thead'), tr = el('tr');
    head.forEach(function (h) { var th = el('th', h.num ? 'num' : '', h.label); tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (cells) {
      var r = el('tr');
      cells.forEach(function (c, i) {
        var td = el('td', head[i].num ? 'num' : '');
        if (c instanceof Node) td.appendChild(c); else td.textContent = c;
        r.appendChild(td);
      });
      tb.appendChild(r);
    });
    t.appendChild(tb);
  }
  function stacked2(main, sub, mainCls) {
    var f = document.createDocumentFragment();
    f.appendChild(el('span', mainCls || '', main));
    if (sub) f.appendChild(el('small', null, sub));
    var span = el('span'); span.appendChild(f); return span;
  }
  function chip(status) {
    var s = el('span', 'status ' + status);
    var lvl = { top: 'good', scale: 'good', kill: 'critical', review: 'critical', inactive: 'warning', watch: 'warning' }[status];
    if (lvl) s.innerHTML = ICON[lvl]; // static markup
    s.appendChild(document.createTextNode(STATUS[status] || status));
    return s;
  }

  function renderChannels(a) {
    var rows = a.channels.slice().sort(function (x, y) { return y.regs - x.regs; }).map(function (c) {
      var name = el('span');
      var sw = el('i', 'sw'); sw.style.background = COLORS[c.channel]; name.appendChild(sw);
      name.appendChild(document.createTextNode(c.label));
      return [name, n(c.visits), n(c.regs), pct(c.cvr), c.channel === 'referral' ? '–' : n(c.loopRegs),
        c.cost ? rs(c.cost) : '–', c.cost ? rs(c.cpr) : '–', pct(c.finalYearPct), pct(c.share)];
    });
    table('tblChannels', [{ label: 'Channel' }, { label: 'Visits', num: 1 }, { label: 'Sign-ups', num: 1 }, { label: 'Conv.', num: 1 },
      { label: '+ Loop', num: 1 }, { label: 'Spend', num: 1 }, { label: '₹ / sign-up', num: 1 }, { label: 'Final-year', num: 1 }, { label: 'Share', num: 1 }], rows);
  }

  function renderPartners(a) {
    var list = state.showAllPartners ? a.partners : a.partners.slice(0, 12);
    var rows = list.map(function (p) {
      return [stacked2(p.name, p.org), el('span', 'code', p.code), ({ champion: 'Champion', club: 'Club', paid: 'Paid', owned: 'Owned' })[p.type] || p.type,
        n(p.visits), n(p.direct), n(p.downstream), p.cost ? rs(p.cpr) : '–', chip(p.status)];
    });
    table('tblPartners', [{ label: 'Partner' }, { label: 'Code' }, { label: 'Type' }, { label: 'Visits', num: 1 }, { label: 'Direct', num: 1 },
      { label: '+ Loop', num: 1 }, { label: '₹ / sign-up', num: 1 }, { label: 'Status' }], rows);
    var t = $('tblPartners');
    if (a.partners.length > 12) {
      var more = el('button', 'linklike', state.showAllPartners ? 'Show top 12' : 'Show all ' + a.partners.length + ' partners');
      more.type = 'button';
      more.style.marginTop = '10px';
      more.onclick = function () { state.showAllPartners = !state.showAllPartners; renderPartners(a); };
      t.parentNode.appendChild(more);
      var old = t.parentNode.querySelectorAll('.linklike');
      for (var i = 0; i < old.length - 1; i++) old[i].remove();
    }
    if (!a.partners.length) table('tblPartners', [{ label: 'No partner links yet. Create one for each champion, club and paid post.' }], []);
  }

  function renderReferrers(a) {
    var rows = a.referrers.slice(0, 10).map(function (r) {
      var reward = r.burst ? chip('review') : (r.next ? el('span', null, (r.next.n - r.count) + ' to ' + r.next.n) : chip('top'));
      return [stacked2(r.name, r.college), n(r.count) + (r.attempts > r.count ? ' (' + r.attempts + ')' : ''), reward];
    });
    table('tblReferrers', [{ label: 'Student' }, { label: 'Verified', num: 1 }, { label: 'Next reward' }],
      rows.length ? rows : [['No referrals yet', '', '']]);
  }

  function renderColleges(a) {
    var champOrgs = {};
    a.partners.forEach(function (p) { if (p.type === 'champion' || p.type === 'club') champOrgs[(p.org || '').toLowerCase()] = 1; });
    var max = a.colleges.length ? a.colleges[0].count : 1;
    var rows = a.colleges.slice(0, 10).map(function (c) {
      var name = el('span'); name.textContent = c.name;
      var bar = el('span', 'ibar'); bar.style.width = Math.max(3, c.count / max * 100) + '%'; name.appendChild(bar);
      return [name, n(c.count), pct(c.finalYear / c.count), champOrgs[c.name.toLowerCase()] ? 'Yes' : 'Recruit'];
    });
    table('tblColleges', [{ label: 'College' }, { label: 'Sign-ups', num: 1 }, { label: 'Final-year', num: 1 }, { label: 'Champion' }],
      rows.length ? rows : [['No sign-ups yet', '', '', '']]);
  }

  function renderMix(a) {
    C.hbars($('chartProjects'), Object.keys(E.PROJECTS).map(function (k) { return { label: E.PROJECTS[k], value: a.projects[k] || 0 }; })
      .sort(function (x, y) { return y.value - x.value; }));
    var fy = cfg.FINAL_YEAR;
    var years = Object.keys(a.gradYears).sort().map(function (y) {
      return { label: String(y) === String(fy) ? y + ' (final year)' : String(y), value: a.gradYears[y], muted: String(y) !== String(fy) };
    });
    C.hbars($('chartYears'), years.length ? years : [{ label: 'No data', value: 0 }]);
  }

  // ---------- simulator ----------
  function buildSliders() {
    var box = $('sliders');
    SLIDERS.forEach(function (s) {
      var wrap = el('div', 'slider');
      var lab = el('label'); lab.htmlFor = 'sl-' + s.k;
      lab.appendChild(document.createTextNode(s.label));
      var out = el('output'); out.id = 'so-' + s.k; out.textContent = s.f(state.params[s.k]);
      lab.appendChild(out);
      var inp = el('input'); inp.type = 'range'; inp.id = 'sl-' + s.k; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = state.params[s.k];
      inp.addEventListener('input', function () {
        state.params[s.k] = Number(inp.value);
        out.textContent = s.f(state.params[s.k]);
        clearTimeout(buildSliders.t);
        buildSliders.t = setTimeout(refresh, 120);
      });
      wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(el('small', null, s.hint));
      box.appendChild(wrap);
    });
  }
  function renderProjection() {
    var p = Sim.project(state.params), box = $('projection'), goal = cfg.GOAL;
    box.textContent = '';
    box.appendChild(el('span', null, 'Projected day-7 sign-ups'));
    box.appendChild(el('b', null, n(p.mean)));
    box.appendChild(el('span', 'fine', 'range ' + n(p.min) + '–' + n(p.max) + ' · ' + n(p.base) + ' direct + ' + n(p.referral) + ' from the referral loop'));
    var ok = p.mean >= goal;
    box.appendChild(el('span', 'status ' + (ok ? 'top' : 'kill'), ok ? 'Clears ' + goal : 'Short by ' + n(goal - p.mean)));
    var reset = el('button', 'linklike', 'Reset to plan'); reset.type = 'button';
    reset.onclick = function () {
      state.params = Object.assign({}, Sim.DEFAULTS);
      SLIDERS.forEach(function (s) { $('sl-' + s.k).value = state.params[s.k]; $('so-' + s.k).textContent = s.f(state.params[s.k]); });
      refresh();
    };
    box.appendChild(reset);
  }

  // ---------- partner links ----------
  var dlg = $('partnerDlg');
  $('newPartner').addEventListener('click', function () {
    $('partnerForm').hidden = false; $('partnerDone').hidden = true; $('pErr').hidden = true;
    $('partnerForm').reset();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('pName').focus();
  });
  $('pCancel').onclick = $('pClose').onclick = function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); };
  $('partnerForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = { name: $('pName').value, org: $('pOrg').value, type: $('pType').value, cost: $('pCost').value };
    $('pSubmit').disabled = true;
    API.createPartner(sessionGet(KEY) || '', input).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Could not create the link');
      var p = res.partner;
      var link = siteUrl() + '?ref=' + p.code + '&utm_source=' + (p.type === 'paid' ? 'paid' : 'whatsapp') + '&utm_medium=' + p.type + '&utm_campaign=ai60';
      $('pLink').value = link;
      var first = E.firstName(p.name);
      var msg = p.type === 'paid'
        ? 'Tracking link for your post: ' + link
        : 'Hi ' + first + '! Here\'s your personal link for the free "' + cfg.WORKSHOP.title + '" workshop (' + cfg.WORKSHOP.dateLabel + ', ' + cfg.WORKSHOP.timeLabel + '):\n' + link +
          '\n\nForward it in your class and placement groups. Every sign-up through it shows up on the leaderboard, and top champions get a Campus Champion certificate and a LinkedIn recommendation.';
      $('pMsg').value = msg;
      $('pWa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
      $('partnerForm').hidden = true; $('partnerDone').hidden = false;
      refresh();
    }).catch(function (err) {
      $('pErr').textContent = err.message; $('pErr').hidden = false;
    }).then(function () { $('pSubmit').disabled = false; });
  });
  $('pCopyLink').onclick = function () { copy($('pLink').value, 'Link copied'); };
  $('pCopyMsg').onclick = function () { copy($('pMsg').value, 'Message copied'); };

  // ---------- controls ----------
  $('srcSim').onclick = function () { state.src = 'sim'; refresh(); };
  $('srcLive').onclick = function () { state.src = 'live'; $('gateErr').hidden = true; refresh(); };
  $('day').addEventListener('input', function () { state.day = Number(this.value); $('dayOut').textContent = this.value; refresh(); });
  $('gateForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    sessionSet(KEY, $('keyInput').value.trim());
    $('gateErr').hidden = true;
    refresh();
  });
  $('exportCsv').addEventListener('click', function () {
    if (!state.analysis) return;
    var cols = ['createdAt', 'code', 'name', 'phone', 'email', 'college', 'branch', 'gradYear', 'project', 'referredBy', 'channel', 'source', 'medium', 'campaign', 'flags'];
    var csv = E.toCSV(state.analysis.regs, cols);
    var a = el('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ai60-signups-' + (state.src === 'sim' ? 'simulated-day' + state.day : API.mode) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  });
  var q = new URLSearchParams(location.search);
  if (q.get('src') === 'live') state.src = 'live';
  if (q.get('day')) { state.day = Math.max(1, Math.min(7, Number(q.get('day')) || 7)); $('day').value = state.day; $('dayOut').textContent = state.day; }

  buildSliders();
  refresh();
  setInterval(function () { if (state.src === 'live' && API.mode === 'live' && !document.hidden) refresh(); }, 60000);
})();
