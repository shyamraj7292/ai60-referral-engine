/*
 * Data access. Live mode talks to the Google Apps Script web app in config.API_URL.
 * Demo mode (no API_URL, or ?demo=1) keeps a store in this browser, seeded from the
 * campaign simulator, and runs the exact same engine functions the backend runs.
 */
var AI60API = (function () {
  'use strict';
  var cfg = window.AI60_CONFIG || {};
  var E = window.AI60;
  var query = new URLSearchParams(location.search);
  var live = !!cfg.API_URL && query.get('demo') !== '1';
  var DEMO_KEY = 'ai60-demo-v1';

  function fetchJSON(url, init) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    if (ctrl) init.signal = ctrl.signal;
    init.redirect = 'follow';
    return fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('Server error ' + r.status);
      return r.json();
    }).then(function (j) { clearTimeout(timer); return j; }, function (err) {
      clearTimeout(timer);
      throw new Error(err && err.name === 'AbortError' ? 'The server took too long to answer' : 'Could not reach the server');
    });
  }
  function getLive(params) {
    var sep = cfg.API_URL.indexOf('?') >= 0 ? '&' : '?';
    return fetchJSON(cfg.API_URL + sep + new URLSearchParams(params).toString(), { method: 'GET' });
  }
  // text/plain keeps this a "simple" CORS request; Apps Script cannot answer a preflight.
  function postLive(body) {
    return fetchJSON(cfg.API_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  }

  // ---------- demo store ----------
  var demo = null;
  function demoState() {
    if (demo) return demo;
    try { demo = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { demo = null; }
    if (!demo || demo.v !== 1) {
      // Demo opens mid-campaign: today is day 4.
      var start = E.addDays(E.dayKey(Date.now()), -3);
      var sim = AI60Sim.generate({}, { startDate: start, asOfDay: 4 });
      var now = Date.now();
      var past = function (k) { return function (x) { return Date.parse(x[k]) <= now; }; };
      demo = { v: 1, start: start, regs: sim.regs.filter(past('createdAt')),
        visits: sim.visits.filter(past('ts')), partners: sim.partners.filter(past('createdAt')) };
      demoSave();
    }
    return demo;
  }
  function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo)); } catch (e) { /* storage blocked: keep in memory */ } }
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 250); }); }
  function nowIso() { return new Date().toISOString(); }

  return {
    mode: live ? 'live' : 'demo',
    campaignStart: function () { return live ? (cfg.CAMPAIGN_START || null) : demoState().start; },

    stats: function () { return live ? getLive({ action: 'stats' }) : later(E.stats(demoState())); },
    me: function (code) { return live ? getLive({ action: 'me', code: code }) : later(E.me(demoState(), code)); },
    refInfo: function (code) { return live ? getLive({ action: 'ref', code: code }) : later(E.refInfo(demoState(), code)); },

    register: function (input) {
      if (live) return postLive(Object.assign({ action: 'register' }, input));
      var res = E.register(demoState(), input, nowIso());
      demoSave();
      if (res.row) delete res.row; // the backend never echoes the row either
      return later(res);
    },
    visit: function (input) {
      if (live) return postLive(Object.assign({ action: 'visit' }, input)).catch(function () {});
      E.visit(demoState(), input, nowIso());
      demoSave();
      return later({ ok: true });
    },
    admin: function (key) {
      if (live) return postLive({ action: 'admin', key: key });
      var s = demoState();
      return later({ ok: true, regs: s.regs, visits: s.visits, partners: s.partners });
    },
    createPartner: function (key, input) {
      if (live) return postLive(Object.assign({ action: 'partner', key: key }, input));
      var res = E.createPartner(demoState(), input, nowIso());
      demoSave();
      return later(res);
    },
    resetDemo: function () {
      try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* ignore */ }
      demo = null;
    }
  };
})();
