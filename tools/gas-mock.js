// Loads apps-script/Code.gs into a sandbox with in-memory fakes of the Apps Script services,
// so the real backend code can be tested (tests/) and served locally (tools/dev-server.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name) {
  const rows = []; // rows[r][c], 0-based; row 0 = header
  const sheet = {
    name,
    rows,
    formulas: 0,
    getMaxRows: () => Math.max(1000, rows.length),
    getLastRow: () => rows.length,
    setFrozenRows: () => sheet,
    appendRow(values) {
      // Real Sheets parses a leading '=' as a formula; count it so tests can prove it never happens.
      values.forEach((v) => { if (typeof v === 'string' && v.charAt(0) === '=') sheet.formulas++; });
      rows.push(values.map((v) => (typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v)));
      return sheet;
    },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const range = {
        setValues(vals) {
          for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j]; }
          return range;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] == null ? '' : row[c - 1 + j]))); }
          return out;
        },
        setFontWeight: () => range,
        setNumberFormat: () => range
      };
      return range;
    }
  };
  return sheet;
}

function loadGas(opts = {}) {
  const sheets = {};
  const props = {};
  const cache = {};
  const logs = [];
  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = makeSheet(n))
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    Utilities: { getUuid: () => require('crypto').randomUUID() },
    Logger: { log: (m) => logs.push(m) }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(opts.file || path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });

  const call = {
    get: (params) => JSON.parse(sandbox.doGet({ parameter: params }).getContent()),
    post: (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent())
  };
  return { sandbox, sheets, props, cache, logs, call, setup: () => sandbox.setup() };
}

module.exports = { loadGas };
