/* ================================================================
 * Google Apps Script adapter: Google Sheets in, JSON out.
 * The engine above (AI60) does all the logic; this part only reads and
 * writes the three sheets and turns requests into engine calls.
 * ================================================================ */

var SHEETS = {
  regs: { name: 'Registrations', cols: ['createdAt', 'code', 'name', 'phone', 'email', 'college', 'branch', 'gradYear', 'project', 'referredBy', 'channel', 'source', 'medium', 'campaign', 'flags'] },
  visits: { name: 'Visits', cols: ['ts', 'session', 'ref', 'channel', 'source', 'medium', 'campaign'] },
  partners: { name: 'Partners', cols: ['createdAt', 'code', 'name', 'org', 'type', 'cost'] }
};

/** Run this once from the editor. It creates the sheets and prints the admin key. */
function setup() {
  Object.keys(SHEETS).forEach(function (k) { sheet_(SHEETS[k]); });
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('Setup done. Admin key for the growth console: ' + key);
  return key;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  return respond_(function () {
    if (p.action === 'stats') return cached_('stats', 60, function () { return AI60.stats(load_(['regs', 'partners'])); });
    if (p.action === 'me') return AI60.me(load_(['regs', 'partners']), p.code);
    if (p.action === 'ref') return AI60.refInfo(load_(['regs', 'partners']), p.code);
    return { ok: true, service: 'ai60-referral-engine' };
  });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  return respond_(function () {
    switch (body.action) {
      case 'register':
        return withLock_(function () {
          var state = load_(['regs', 'partners']);
          var res = AI60.register(state, body, new Date().toISOString());
          if (res.ok && res.row) {
            append_(SHEETS.regs, res.row);
            CacheService.getScriptCache().remove('stats');
          }
          delete res.row;
          return res;
        });
      case 'visit':
        // Raw and cheap: channel is resolved when the console reads visits.
        append_(SHEETS.visits, {
          ts: new Date().toISOString(),
          session: AI60.clean(body.session, 24),
          ref: AI60.normCode(body.ref),
          channel: '',
          source: AI60.clean(body.utm && body.utm.source, 40).toLowerCase(),
          medium: AI60.clean(body.utm && body.utm.medium, 40).toLowerCase(),
          campaign: AI60.clean(body.utm && body.utm.campaign, 40)
        });
        return { ok: true };
      case 'admin':
        checkKey_(body.key);
        var s = load_(['regs', 'visits', 'partners']);
        var idx = AI60.buildIndex(s);
        s.visits.forEach(function (v) {
          if (v.channel) return;
          var a = AI60.attribute(v.ref, { source: v.source, medium: v.medium, campaign: v.campaign }, idx);
          v.channel = a.channel;
          v.ref = a.referredBy;
        });
        return { ok: true, regs: s.regs, visits: s.visits, partners: s.partners };
      case 'partner':
        checkKey_(body.key);
        return withLock_(function () {
          var state = load_(['regs', 'partners']);
          var res = AI60.createPartner(state, body, new Date().toISOString());
          if (res.ok) append_(SHEETS.partners, res.partner);
          return res;
        });
      default:
        return { ok: false, error: 'Unknown action' };
    }
  });
}

// ---------- helpers ----------

function respond_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!expected || String(key || '') !== expected) throw new Error('Wrong admin key');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cached_(key, seconds, fn) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var value = fn();
  try { cache.put(key, JSON.stringify(value), seconds); } catch (err) { /* over 100 KB: skip caching */ }
  return value;
}

function sheet_(def) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    // Plain-text columns: phone numbers keep their digits, ISO dates stay strings.
    sh.getRange(1, 1, sh.getMaxRows(), def.cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function load_(names) {
  var out = { regs: [], visits: [], partners: [] };
  names.forEach(function (n) { out[n] = readAll_(SHEETS[n]); });
  return out;
}

function readAll_(def) {
  var sh = sheet_(def);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, def.cols.length).getValues().map(function (row) {
    var o = {};
    def.cols.forEach(function (c, i) {
      var v = row[i];
      if (v instanceof Date) v = v.toISOString();
      if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
      o[c] = v === null || v === undefined ? '' : (typeof v === 'number' ? String(v) : v);
    });
    return o;
  });
}

function append_(def, obj) {
  sheet_(def).appendRow(def.cols.map(function (c) { return AI60.safeCell(obj[c] == null ? '' : String(obj[c])); }));
}
