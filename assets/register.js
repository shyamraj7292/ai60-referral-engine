/* Sign-up page: attribution, registration, referral sharing, leaderboards. */
(function () {
  'use strict';
  var cfg = window.AI60_CONFIG;
  var E = window.AI60;
  var API = window.AI60API;
  var W = cfg.WORKSHOP;
  var $ = function (id) { return document.getElementById(id); };
  var ME_KEY = 'ai60-me', ATTR_KEY = 'ai60-attr';

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
  function unstore(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copy(text, done) {
    var ok = function () { toast(done || 'Copied'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
    function fallback() {
      var ta = el('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('Press and hold to copy'); }
      ta.remove();
    }
  }

  // ---------- mode & workshop details ----------
  var pill = $('modePill');
  pill.textContent = API.mode === 'live' ? 'Live' : 'Demo data';
  pill.className = 'pill ' + (API.mode === 'live' ? 'pill-live' : 'pill-demo');
  $('mDate').textContent = W.dateLabel;
  $('mTime').textContent = W.timeLabel;
  $('mPlace').textContent = W.platform;

  // ---------- attribution: last link with a ref wins, kept across visits ----------
  var q = new URLSearchParams(location.search);
  var attr = store(ATTR_KEY) || {};
  if (q.get('ref') || q.get('utm_source') || q.get('utm_medium')) {
    attr = { ref: E.normCode(q.get('ref')), utm: { source: q.get('utm_source') || '', medium: q.get('utm_medium') || '', campaign: q.get('utm_campaign') || '' } };
    store(ATTR_KEY, attr);
  }
  attr.utm = attr.utm || {};

  var session;
  try { session = sessionStorage.getItem('ai60-session'); } catch (e) { session = null; }
  if (!session) {
    session = Math.random().toString(36).slice(2, 12);
    try { sessionStorage.setItem('ai60-session', session); } catch (e) { /* ignore */ }
    API.visit({ session: session, ref: attr.ref || '', utm: attr.utm });
  }

  // "Ananya invited you": a referred visitor should see who sent them.
  if (attr.ref) {
    API.refInfo(attr.ref).then(function (info) {
      if (!info || !info.ok || !info.label) return;
      var text = info.kind === 'club' ? 'Shared by ' + info.label
        : info.label + (info.org ? ' from ' + info.org : '') + ' invited you';
      $('inviteAv').textContent = info.label.charAt(0).toUpperCase();
      $('inviteText').textContent = text;
      $('invite').hidden = false;
    }).catch(function () {});
  }

  // ---------- project picker ↔ form radio ----------
  var cards = Array.prototype.slice.call(document.querySelectorAll('.project'));
  function setProject(key, fromCard) {
    cards.forEach(function (c) { c.setAttribute('aria-checked', String(c.dataset.project === key)); });
    var radio = document.querySelector('input[name="project"][value="' + key + '"]');
    if (radio) radio.checked = true;
    if (fromCard) {
      $('register').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { $('fName').focus({ preventScroll: true }); }, 450);
    }
  }
  cards.forEach(function (c) { c.addEventListener('click', function () { setProject(c.dataset.project, true); }); });
  document.querySelectorAll('input[name="project"]').forEach(function (r) {
    r.addEventListener('change', function () { setProject(r.value, false); });
  });

  // ---------- form ----------
  E.BRANCHES.forEach(function (b) { var o = el('option', null, b); o.value = b; $('fBranch').appendChild(o); });
  var form = $('regForm');
  function showErrors(errors) {
    form.querySelectorAll('.field').forEach(function (f) {
      var msg = errors[f.dataset.f];
      f.classList.toggle('bad', !!msg);
      var e = f.querySelector('.err');
      if (e) e.textContent = msg || '';
    });
    var first = form.querySelector('.field.bad input, .field.bad select');
    if (first) first.focus();
  }
  form.addEventListener('input', function (ev) {
    var f = ev.target.closest('.field');
    if (f && f.classList.contains('bad')) f.classList.remove('bad');
  });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('formError').hidden = true;
    var fd = new FormData(form);
    var input = {
      name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), college: fd.get('college'),
      branch: fd.get('branch'), gradYear: fd.get('gradYear'), project: fd.get('project') || 'unsure',
      website: fd.get('website'), ref: attr.ref || '', utm: attr.utm
    };
    var check = E.validate(input);
    if (!check.ok) { showErrors(check.errors); return; }
    showErrors({});
    var btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving your seat…';
    API.register(input).then(function (res) {
      if (!res || !res.ok) {
        if (res && res.errors) showErrors(res.errors);
        throw new Error((res && res.error) || 'Please check the highlighted fields');
      }
      var me = res.me;
      store(ME_KEY, { code: me.code, firstName: me.firstName });
      showSuccess(me, res.existing ? 'existing' : 'new');
      loadStats();
    }).catch(function (err) {
      $('formError').textContent = err.message + '. Please try again.';
      $('formError').hidden = false;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Save my free seat →';
    });
  });

  // ---------- success + referral ----------
  function baseUrl() {
    if (cfg.SITE_URL) return cfg.SITE_URL.replace(/[?#].*$/, '');
    return location.href.replace(/[?#].*$/, '');
  }
  function linkFor(code) { return baseUrl() + '?ref=' + encodeURIComponent(code); }
  function calDates() {
    var s = new Date(W.startISO), e = new Date(s.getTime() + W.durationMin * 60000);
    var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    return { s: f(s), e: f(e) };
  }

  var current = null;
  // how: 'new' | 'existing' (registered again) | 'returning' (came back to the page)
  function showSuccess(me, how) {
    var existing = how !== 'new';
    current = me;
    form.hidden = true;
    $('success').hidden = false;
    $('sTitle').textContent = how === 'returning' ? 'Welcome back, ' + me.firstName + '!'
      : how === 'existing' ? 'You\'re already registered, ' + me.firstName + '!' : 'You\'re in, ' + me.firstName + '!';
    $('sText').textContent = existing
      ? 'Here is your personal link again. Every friend who signs up with it counts toward your rewards.'
      : 'We\'ll WhatsApp you the joining link a day before. Add it to your calendar so you don\'t miss it.';
    var link = linkFor(me.code);
    $('myLink').value = link;
    var msg = 'Placement season and no AI project on your resume yet? I just grabbed a free seat in a 60-min live workshop where we build our first AI project (resume analyzer / quiz bot). No AI experience needed. ' +
      W.dateLabel + ', ' + W.timeLabel + '. Join with my link: ' + link;
    $('waShare').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('liShare').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link);
    $('igCopy').onclick = function () {
      copy('Shipping my first AI project in 60 minutes this ' + W.dateLabel.split(',')[0] + '. Free live workshop for final-years. Link to join: ' + link, 'Caption copied. Paste it on your story');
    };
    $('copyLink').onclick = function () { copy(link, 'Link copied'); };
    var d = calDates();
    $('gcal').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(W.title) +
      '&dates=' + d.s + '/' + d.e + '&details=' + encodeURIComponent('Free live workshop. Bring a laptop. Invite friends: ' + link);
    renderMe(me);
    if (!existing) $('sTitle').focus();
  }
  $('ics').addEventListener('click', function () {
    var d = calDates();
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI60//Workshop//EN', 'BEGIN:VEVENT',
      'UID:ai60-' + d.s + '@workshop', 'DTSTAMP:' + d.s, 'DTSTART:' + d.s, 'DTEND:' + d.e,
      'SUMMARY:' + W.title, 'DESCRIPTION:Free live workshop. Bring a laptop.',
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Workshop in 30 minutes', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = el('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'ai60-workshop.ics';
    document.body.appendChild(a); a.click(); a.remove();
  });

  function renderMe(me) {
    var n = me.referrals || 0;
    $('myCount').textContent = n;
    $('myRank').textContent = me.rank ? 'Rank #' + me.rank + ' of all referrers' : 'Share once to get on the board';
    $('mfill').style.width = Math.min(100, n * 10) + '%';
    var track = $('mtrack');
    track.querySelectorAll('.mk').forEach(function (m) { m.remove(); });
    var list = $('rewards');
    list.textContent = '';
    E.MILESTONES.forEach(function (m) {
      var mk = el('span', 'mk' + (n >= m.n ? ' on' : ''), String(m.n));
      mk.style.left = (m.n * 10) + '%';
      track.appendChild(mk);
      var li = el('li', n >= m.n ? 'done' : '');
      li.appendChild(el('b', null, (n >= m.n ? '✓ ' : '') + m.n + ' friends'));
      li.appendChild(el('span', null, m.reward));
      list.appendChild(li);
    });
  }
  $('refresh').addEventListener('click', function () {
    if (!current) return;
    API.me(current.code).then(function (me) { if (me && me.ok) { current = me; renderMe(me); toast('Updated'); } });
  });
  $('notMe').addEventListener('click', function () {
    unstore(ME_KEY);
    current = null;
    form.reset();
    setProject('unsure', false);
    $('success').hidden = true;
    form.hidden = false;
    $('fName').focus();
  });

  // ---------- leaderboards + social proof ----------
  function renderBoard(ol, rows, nameOf, subOf) {
    ol.textContent = '';
    if (!rows.length) { var li = el('li'); li.appendChild(el('span', 'empty', 'No one yet. Your name could be first.')); ol.appendChild(li); return; }
    var max = rows[0].count || 1;
    rows.forEach(function (r, i) {
      var li = el('li');
      li.appendChild(el('span', 'rk', String(i + 1)));
      var nm = el('span', 'nm', nameOf(r));
      var sub = subOf ? subOf(r) : '';
      if (sub) nm.appendChild(el('small', null, sub));
      var bar = el('span', 'bar');
      bar.style.width = Math.max(4, Math.round(r.count / max * 100)) + '%';
      nm.appendChild(bar);
      li.appendChild(nm);
      li.appendChild(el('span', 'ct', String(r.count)));
      ol.appendChild(li);
    });
  }
  function loadStats() {
    return API.stats().then(function (s) {
      if (!s || !s.ok) throw new Error('stats');
      renderBoard($('lbPeople'), s.topReferrers.slice(0, 8), function (r) { return r.name; }, function (r) { return r.college; });
      renderBoard($('lbColleges'), s.topColleges.slice(0, 8), function (r) { return r.college; }, null);
      if (s.total >= (cfg.SOCIAL_PROOF_MIN || 0)) {
        $('proofText').textContent = s.total + ' students from ' + s.colleges + ' colleges are in';
        $('proof').hidden = false;
      }
      var dl = $('collegeList');
      dl.textContent = '';
      s.topColleges.forEach(function (c) { var o = el('option'); o.value = c.college; dl.appendChild(o); });
    }).catch(function () {
      ['lbPeople', 'lbColleges'].forEach(function (id) {
        var ol = $(id); ol.textContent = '';
        var li = el('li'); li.appendChild(el('span', 'empty', 'Leaderboard is warming up. Check back soon.')); ol.appendChild(li);
      });
    });
  }

  // ---------- boot ----------
  var saved = store(ME_KEY);
  if (saved && saved.code) {
    API.me(saved.code).then(function (me) {
      if (me && me.ok) showSuccess(me, 'returning');
      else unstore(ME_KEY);
    }).catch(function () {});
  }
  loadStats();
  setInterval(function () { if (!document.hidden) loadStats(); }, 60000);
})();
