// Local preview. `node tools/dev-server.js` serves the site in demo mode.
// `node tools/dev-server.js --live` also runs the real Code.gs against an in-memory sheet at /exec
// and points config.js at it, so the full live path can be tested without deploying.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const live = process.argv.includes('--live');
const port = Number(process.env.PORT) || (live ? 8788 : 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

let gas = null, key = null;
if (live) {
  require('./build-gas.js');
  gas = require('./gas-mock.js').loadGas();
  key = gas.setup();
  console.log('Mock Apps Script backend at /exec. Admin key: ' + key);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (live && url.pathname === '/exec') {
    const send = (out) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.getContent()); };
    if (req.method === 'GET') return send(gas.sandbox.doGet({ parameter: Object.fromEntries(url.searchParams) }));
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => send(gas.sandbox.doPost({ postData: { contents: body } })));
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  let data = fs.readFileSync(file);
  if (live && url.pathname === '/assets/config.js') {
    data = Buffer.from(data.toString('utf8').replace("API_URL: ''", `API_URL: 'http://localhost:${port}/exec'`));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(data);
}).listen(port, () => console.log(`AI60 ${live ? 'LIVE (mock backend)' : 'demo'} preview: http://localhost:${port}/`));
