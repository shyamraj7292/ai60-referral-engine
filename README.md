# AI60 referral engine

The working asset for the NxtWave Growth Intern challenge: the machine behind the plan to get
500 final-year students into a free "Build Your First AI Project in 60 Minutes" workshop.

- **Sign-up page** (`index.html`): 20-second, mobile-first registration. Every student gets a personal
  referral link, a pre-written WhatsApp share, milestone rewards (3 / 5 / 10 friends), and live
  student + college leaderboards. Referred visitors see who invited them.
- **Growth console** (`dashboard.html`): progress against the day-by-day plan, a channel and
  partner funnel (visits → sign-ups → loop sign-ups → ₹ per sign-up), viral coefficient,
  targeting checks, fraud review, CSV export, and tracked links for every champion, club and
  paid post. **Today's decisions** turns the plan's rules into actions: kill or scale a paid
  channel, replace inactive champions, nudge students one referral from a reward, hold rewards
  for suspicious referral bursts.
- **Plan simulator**: replays a synthetic 7-day campaign from the plan's assumptions; sliders
  re-run it. Clearly labelled as simulated.
- **Backend**: a Google Sheet + Apps Script web app (`apps-script/Code.gs`). No server to run,
  never sleeps, and the growth team can open the sheet.

With no backend configured the site runs in **demo mode** (sample data stored in the browser), so
the link always works.

## Deploy: 10 minutes

### 1. Backend (Google Sheet + Apps Script)
1. Create a new Google Sheet, e.g. "AI60 sign-ups".
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, and save.
3. In the function dropdown pick **setup** → **Run**. Approve the permissions prompt. For your own
   script Google shows "unverified app": click **Advanced → Go to … (unsafe)**.
   The **Execution log** prints your **admin key**. Keep it; the console asks for it.
4. **Deploy → New deployment → ⚙ → Web app**. Execute as **Me**, Who has access **Anyone** →
   **Deploy**. Copy the **Web app URL** (ends in `/exec`).
5. Paste it into `assets/config.js` → `API_URL: 'https://script.google.com/macros/s/…/exec'`.

Changing the script later: **Deploy → Manage deployments → ✎ → Version: New version**. The URL stays the same.

### 2. Front end (any static host)
- **Vercel**: push this folder to a GitHub repo → vercel.com → Add New Project → import it →
  Framework preset **Other**, no build command → Deploy.
- **Netlify Drop**: drag this folder onto app.netlify.com/drop.

Referral links use the page's own URL. Set `SITE_URL` in `config.js` only if you use a custom domain.

### 3. Smoke test
Open the site → register with test details → open your referral link in a private window and register
a "friend" → open `dashboard.html` → **Live data** → paste the admin key. You should see both sign-ups
and the referral credit. Check the Google Sheet too.

## Run locally
```bash
node tools/dev-server.js           # demo mode on http://localhost:8787
node tools/dev-server.js --live    # real Code.gs on an in-memory sheet, http://localhost:8788 (prints the admin key)
node tests/run.js                  # engine + Apps Script backend tests
```

## How it's built
| File | What it does |
|---|---|
| `assets/engine.js` | All the logic: validation, codes, attribution, dedupe, fraud flags, leaderboards, analytics and decision rules. Runs in the browser, in Node tests, and inside Apps Script. |
| `apps-script/gas-adapter.js` | The thin Sheets ⇄ JSON layer. `node tools/build-gas.js` bundles it with the engine into `Code.gs`. |
| `assets/sim.js` | Seeded campaign simulator built from the plan's assumptions. |
| `assets/api.js` | Live backend or in-browser demo store, same interface. |
| `assets/register.js`, `assets/dashboard.js`, `assets/charts.js` | Pages and dependency-free SVG charts. |

Decisions worth knowing:
- **Referral credit is earned, not claimed.** Duplicate phone/email never creates a second sign-up;
  throwaway-email sign-ups are flagged and don't count; 5+ referrals inside 15 minutes is held for
  review; cash prizes count only friends who attend.
- **Privacy.** Public endpoints return first name + initial and college only. Phone and email go
  only to the console, and only with the admin key.
- **Spreadsheet safety.** Every value written to the sheet or the CSV is neutralised so
  `=HYPERLINK(…)`-style input can't run as a formula.
- **Public counter hides below 50.** "3 students registered" is anti-social-proof.

Known limits: Apps Script answers in about 1–2 s, and the public endpoint has no CAPTCHA (honeypot,
dedupe and flags only). Phone numbers aren't OTP-verified; that's next on the list.
