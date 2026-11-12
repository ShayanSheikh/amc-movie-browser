#!/usr/bin/env node
/**
 * End-to-end check of the main flows in mock mode, without a browser.
 *
 * Starts `next dev` on a scratch DB (your ./data/app.db is untouched), drives the
 * server actions the same way the forms do, and checks the rendered pages.
 * A local HTTP server stands in for the webhook unless WEBHOOK_URL is set
 * (then a real Discord/Slack webhook gets a test message and one alert).
 *
 *   npm run verify                      # local fake webhook
 *   WEBHOOK_URL=https://discord.com/api/webhooks/... npm run verify
 *   PORT=3200 npm run verify            # default 3100
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT || 3100);
const BASE = `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amc-verify-"));
const dbFile = path.join(tmp, "app.db");

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
  if (!ok) failures++;
}
const section = (s) => console.log(`\n${s}`);

// ---------- fake webhook receiver ----------
const received = [];
const hook = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      received.push(JSON.parse(body));
    } catch {
      received.push(body);
    }
    res.writeHead(204).end();
  });
});
await new Promise((r) => hook.listen(0, "127.0.0.1", r));
const webhookUrl = process.env.WEBHOOK_URL || `http://127.0.0.1:${hook.address().port}/hook`;
const realWebhook = Boolean(process.env.WEBHOOK_URL);

// ---------- dev server ----------
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: { ...process.env, DATABASE_URL: dbFile, AMC_MODE: "mock", DISABLE_SCHEDULER: "1", AMC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function cleanup() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  hook.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/cron/poll`);
      if (r.status) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not start on ${PORT}\n${serverLog}`);
}

// ---------- helpers ----------
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function page(p) {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.text();
}

/** Every <form> on the page that posts to a server action, with its hidden fields. */
function forms(html) {
  return html
    .split(/<form\b/)
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("</form>")))
    .map((f) => {
      const id = f.match(/name="\$ACTION_ID_([0-9a-f]+)"/)?.[1];
      const fields = {};
      for (const m of f.matchAll(/<input[^>]*>/g)) {
        const name = m[0].match(/name="([^"]+)"/)?.[1];
        if (!name || name.startsWith("$ACTION")) continue;
        fields[name] = decode(m[0].match(/value="([^"]*)"/)?.[1] ?? m[0].match(/defaultValue="([^"]*)"/)?.[1] ?? "");
      }
      return { id, fields, text: decode(f.replace(/<[^>]+>/g, " ")) };
    })
    .filter((f) => f.id);
}

/** Submit the first form on `p` matching `pick`, overriding fields with `extra`. */
async function submit(p, pick, extra = {}) {
  const f = forms(await page(p)).find(pick);
  if (!f) throw new Error(`no matching form on ${p}`);
  const fd = new FormData();
  fd.append(`$ACTION_ID_${f.id}`, "");
  for (const [k, v] of Object.entries({ ...f.fields, ...extra })) fd.append(k, v);
  const r = await fetch(BASE + p, { method: "POST", body: fd, redirect: "manual" });
  if (r.status >= 400) throw new Error(`POST ${p} -> ${r.status}\n${(await r.text()).slice(0, 500)}`);
}

const movieForm = (name) => (f) => f.fields.movie && JSON.parse(f.fields.movie).name === name;
const buttonForm = (label) => (f) => f.text.includes(label);
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

/** Text of the dashboard's alert sidebar. */
async function alertFeed() {
  const t = text(await page("/"));
  return t.slice(t.indexOf("Alerts"));
}

/** Calls a server action that isn't bound to a <form> (e.g. sendTestWebhook) by name. */
async function callAction(name, args = []) {
  const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name)?.[0];
  if (!id) throw new Error(`action ${name} not found in manifest`);
  const r = await fetch(`${BASE}/settings`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
    body: JSON.stringify(args),
  });
  return r.text();
}

// ---------- flows ----------
try {
  process.stdout.write(`Starting next dev on :${PORT} (scratch DB ${dbFile})…`);
  await waitForServer();
  console.log(" up.");

  section("Setup");
  await submit("/theatres?q=62701", (f) => f.fields.theatre && JSON.parse(f.fields.theatre).id === 9001);
  check("starred AMC Riverside 16", text(await page("/theatres")).includes("AMC Riverside 16"));

  section("Watchlist");
  const movies0 = text(await page("/movies"));
  check("/movies lists Now playing and Coming soon", movies0.includes("Now playing") && movies0.includes("Coming soon"));
  check("watchlist starts empty", movies0.includes("Nothing yet"));

  await submit("/movies", movieForm("Starfall")); // now playing
  await submit("/movies", movieForm("Glass Meridian")); // coming soon
  let m = await page("/movies");
  let watchingButtons = (text(m).match(/Watching ✓/g) ?? []).length;
  check("watch from Now playing + Coming soon", watchingButtons === 4, `expected 4 "Watching ✓" (2 in watchlist, 2 in lists), got ${watchingButtons}`);

  await submit("/movies", (f) => f.fields.movieId === "71001" && "notes" in f.fields, { notes: "IMAX 70mm only" });
  check("notes saved on /movies", (await page("/movies")).includes('value="IMAX 70mm only"'));

  let dash = text(await page("/"));
  check("dashboard shows Starfall with notes", dash.includes("Starfall") && dash.includes("IMAX 70mm only"));
  check("dashboard shows Glass Meridian", dash.includes("Glass Meridian"));

  await submit("/movies", movieForm("The Long Thaw"));
  await submit("/movies", movieForm("The Long Thaw"));
  m = text(await page("/movies"));
  check("watch then unwatch removes it", (m.match(/Watching ✓/g) ?? []).length === 4 && !text(await page("/")).includes("The Long Thaw"));

  section("New-showtime alerts");
  await submit("/settings", (f) => "webhookUrl" in f.fields, { webhookUrl });
  check("webhook URL saved", (await page("/settings")).includes(webhookUrl.replace(/&/g, "&amp;")));

  const test = await callAction("sendTestWebhook");
  check("Send test reports success", test.includes('"ok":true'), test.slice(-300));
  if (!realWebhook) check("test message delivered", received.some((b) => b.kind === "test"), JSON.stringify(received));

  await submit("/", buttonForm("Check now"));
  dash = text(await page("/"));
  check("first poll ran", !dash.includes("Not checked yet"));
  check("first poll seeds silently (no alerts)", (await alertFeed()).includes("No alerts yet"));
  check("dashboard shows seeded Starfall showtimes", /AMC Riverside 16 \d+ showtimes/.test(dash));

  await submit("/settings", buttonForm("Advance"));
  check("mock step advanced to 1", text(await page("/settings")).includes("Current step: 1"));

  const before = received.length;
  await submit("/", buttonForm("Check now"));
  const feed = await alertFeed();
  check('"Tickets are up: Glass Meridian" alert in-app', feed.includes("Tickets are up: Glass Meridian @ AMC Riverside 16"), feed.slice(0, 400));
  check("Starfall gets a new-showtimes alert for the extra days", /\d+ new showtimes: Starfall @ AMC Riverside 16/.test(feed));
  check("alerts marked sent", feed.includes("· sent") && !feed.includes("send failed"));
  if (!realWebhook) {
    const bodies = received.slice(before);
    check("alerts delivered to webhook", bodies.some((b) => b.kind === "new_showtimes" && b.title.includes("Tickets are up: Glass Meridian")), JSON.stringify(bodies).slice(0, 300));
  }

  await submit("/", buttonForm("Check now"));
  const feed2 = await alertFeed();
  check("re-polling without changes adds no alerts", (feed2.match(/@ AMC Riverside 16/g) ?? []).length === (feed.match(/@ AMC Riverside 16/g) ?? []).length);

  await submit("/", buttonForm("Clear"));
  check("Clear empties the feed", (await alertFeed()).includes("No alerts yet"));
} catch (err) {
  failures++;
  console.error(`\n✗ ${err.stack || err}`);
} finally {
  cleanup();
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
if (realWebhook && !failures) console.log("Check your channel for the test message and the Glass Meridian alert.");
process.exit(failures ? 1 : 0);
