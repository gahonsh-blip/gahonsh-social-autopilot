/**
 * Renders today's real post for every channel and writes docs/today.html.
 * Runs the actual .gs sources in a Node VM, exactly like the test suite, so what
 * you see here is what the Apps Script will publish.
 *
 *   node render-today.js [YYYY-MM-DD]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['config.gs', 'calendar.gs', 'content.gs', 'image.gs', 'publishers.gs', 'Code.gs'];
const sandbox = {
  console, JSON, Date, Math, Object, String, Number, Array, RegExp, parseInt, isNaN, encodeURIComponent,
  Logger: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
  Utilities: {
    formatDate: (date, tz, fmt) => {
      const y = date.getUTCFullYear(), m = String(date.getUTCMonth() + 1).padStart(2, '0'), d = String(date.getUTCDate()).padStart(2, '0');
      return fmt === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : date.toISOString();
    },
    sleep: () => {},
    newBlob: (s) => ({ getBytes: () => Array.from(Buffer.from(String(s), 'utf8')) }),
    computeHmacSignature: (a, v, k) => Array.from(require('crypto').createHmac('sha1', String(k)).update(String(v)).digest()),
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    MacAlgorithm: { HMAC_SHA_1: 'HMAC_SHA_1' },
  },
  ScriptApp: { getOAuthToken: () => '', getProjectTriggers: () => [] },
  CalendarApp: { getDefaultCalendar: () => ({ getEventsForDay: () => [] }) },
  SpreadsheetApp: { create: () => ({ getId: () => 'x', getSheetByName: () => null, insertSheet: () => ({ appendRow: () => {} }) }) },
  DriveApp: {}, SlidesApp: {},
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 0, getContentText: () => '', getBlob: () => ({}), getHeaders: () => ({}) }) },
};
sandbox.global = sandbox;
const ctx = vm.createContext(sandbox);
FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f }));

const arg = process.argv[2];
const date = arg ? new Date(arg + 'T06:00:00Z') : new Date();
const post = vm.runInContext('buildDailyPost', ctx)(date);
const matrix = vm.runInContext('channelMatrix', ctx)();

const xText = vm.runInContext('shortText_', ctx)(post).slice(0, 275);
const bskyText = (vm.runInContext('shortText_', ctx)(post) + '\n' + post.hashtags).slice(0, 290);
const full = vm.runInContext('fullText_', ctx)(post);

const channels = [
  { name: 'Blogger (blog post)', limit: 'no limit', text: full },
  { name: 'Telegram', limit: '1024 with photo', text: full.slice(0, 1020) },
  { name: 'Bluesky', limit: '300', text: bskyText },
  { name: 'Mastodon', limit: '480+', text: full.slice(0, 480) },
  { name: 'Dev.to (article)', limit: 'unlimited', text: full },
  { name: 'X / Twitter', limit: '280', text: xText },
  { name: 'Instagram', limit: '2200', text: full },
  { name: 'LinkedIn', limit: '3000', text: full.slice(0, 2900) },
  { name: 'Facebook Page', limit: '63000', text: full },
];

const rows = channels.map((c) => {
  const len = c.text.length;
  return { ...c, len, fits: c.limit === 'no limit' || c.limit === 'unlimited' ? true : len <= parseInt(c.limit, 10) };
});

console.log(`Date: ${post.dateKey}  type: ${post.type}${post.occasion ? ' (' + post.occasion + ')' : ''}`);
console.log(`Title: ${post.title}`);
console.log(`Headline: ${post.headline}\n`);
rows.forEach((r) => console.log(`${r.fits ? 'OK  ' : 'LONG'} ${r.name.padEnd(20)} ${String(r.len).padStart(4)} chars  limit ${r.limit}`));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GAHONSH autopilot - today's post</title>
<style>
:root{--teal:#12776A;--amber:#C9922E;--navy:#1E3A4C;--bg:#F7F5F0;--ink:#12211F}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
header{background:var(--teal);color:#fff;padding:28px 20px}header h1{margin:0;font-size:22px;letter-spacing:.5px}
header p{margin:6px 0 0;opacity:.9;font-size:14px}
main{max-width:820px;margin:0 auto;padding:24px 20px 60px}
.card{background:#fff;border:1px solid #e6e1d6;border-radius:14px;padding:20px;margin-bottom:18px}
.card h2{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:1.2px;color:var(--navy);opacity:.75}
.pre{white-space:pre-wrap;font-size:15px}
.tag{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;margin:0 6px 6px 0;background:#eef4f2;color:var(--teal)}
.tag.no{background:#fdf1e3;color:#8a5a12}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:7px 4px;border-bottom:1px solid #eee}
td:last-child{text-align:right;color:#64706d}
.ok{color:var(--teal)}.gap{color:#8a5a12}
</style></head><body>
<header><h1>GAHONSH Social Autopilot</h1><p>${post.dateKey} &middot; ${post.type}${post.occasion ? ' &middot; ' + post.occasion : ''}</p></header>
<main>
<div class="card"><h2>Headline</h2><div class="pre" style="font-size:18px;font-weight:600">${post.headline}</div></div>
<div class="card"><h2>Full post</h2><div class="pre">${full.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
<div style="margin-top:12px">${post.hashtags.split(' ').map((t) => `<span class="tag">${t}</span>`).join('')}</div></div>
<div class="card"><h2>Where it goes</h2><table>
${matrix.map((m) => `<tr><td>${m.channel}</td><td class="${m.ready ? 'ok' : 'gap'}">${m.ready ? 'ready' : (m.enabled ? 'needs ' + m.missing.join(', ') : 'switched off')}</td></tr>`).join('')}
</table></div>
<div class="card"><h2>Length check per channel</h2><table>
${rows.map((r) => `<tr><td>${r.name}</td><td class="${r.fits ? 'ok' : 'gap'}">${r.len} chars (limit ${r.limit})</td></tr>`).join('')}
</table></div>
</main></body></html>`;
const docs = path.join(__dirname, 'docs');
const archive = path.join(docs, 'archive');
fs.mkdirSync(archive, { recursive: true });
fs.writeFileSync(path.join(docs, 'today.html'), html);
fs.writeFileSync(path.join(archive, post.dateKey + '.html'), html);

// Index of every day that has been generated, newest first.
const days = fs.readdirSync(archive).filter((f) => /\.html$/.test(f)).sort().reverse();
const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GAHONSH autopilot - post archive</title>
<style>:root{--teal:#12776A;--bg:#F7F5F0;--ink:#12211F}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
header{background:var(--teal);color:#fff;padding:28px 20px}header h1{margin:0;font-size:22px}
main{max-width:720px;margin:0 auto;padding:24px 20px 60px}
ul{list-style:none;padding:0}li{background:#fff;border:1px solid #e6e1d6;border-radius:12px;margin-bottom:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}
a{color:var(--teal);text-decoration:none;font-weight:600}.muted{color:#64706d;font-size:13px}</style></head>
<body><header><h1>GAHONSH autopilot - post archive</h1></header><main>
<p class="muted">One entry per day. The newest is also at <a href="today.html">today.html</a>.</p>
<ul>${days.map((f) => `<li><a href="archive/${f}">${f.replace('.html', '')}</a><span class="muted">${f.replace('.html', '') === post.dateKey ? 'latest' : ''}</span></li>`).join('')}</ul>
</main></body></html>`;
fs.writeFileSync(path.join(docs, 'index.html'), index);
console.log('\nwrote docs/today.html, docs/archive/' + post.dateKey + '.html, docs/index.html');
