import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, '.generated', 'dark-visualizations');
const OUT_DIR = path.join(ROOT, 'docs', 'assets', 'visualizations', 'dark');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const views = [
  ['overview', { title: 'Overview dashboard' }, 900],
  ['stat', { title: 'Total time', metric: 'total_time' }, 560],
  ['trend-chart', { title: 'Trend chart', days: 14 }, 720],
  ['heatmap', { title: 'Weekly heatmap' }, 840],
  ['top-apps', { title: 'Top apps', limit: 8 }, 720],
  ['categories', { title: 'Categories', limit: 6 }, 720],
  ['details', { title: 'Recent sessions', limit: 10 }, 840],
  ['transition-sankey', { title: 'Attention flow', limit: 8 }, 840],
  ['app-lanes', { title: 'App lanes', limit: 8 }, 840],
  ['session-waterfall', { title: 'Session waterfall', limit: 16 }, 840],
  ['app-rhythm', { title: 'App rhythm', limit: 8 }, 840],
  ['fragmentation-scatter', { title: 'Focus vs fragmentation' }, 720],
  ['category-balance', { title: 'Category balance', limit: 6 }, 720],
  ['day-archetypes', { title: 'Day archetypes', limit: 8 }, 840],
  ['contribution-heatmap', { title: 'Contribution heatmap' }, 840],
  ['date-hour-heatmap', { title: 'Date × hour heatmap' }, 840],
  ['projects', { title: 'Projects', limit: 6 }, 840],
  ['distribution', { title: 'Distribution donut', legend: true, stats: true, label: true }, 840],
  ['web-history', { title: 'Web history', limit: 10, tab: 'timeline' }, 840],
  ['reports', { title: 'Reports', groupBy: 'app', format: 'csv' }, 900],
  ['input-stats', { title: 'Input stats' }, 720],
  ['cursor-heatmap', { title: 'Cursor heatmap', height: 260 }, 840],
  ['typing-intensity', { title: 'Typing intensity', height: 260 }, 720],
  ['top-keys', { title: 'Top typed keys', limit: 8 }, 720],
  ['top-words', { title: 'Top typed words', limit: 10 }, 720],
  ['input-activity', { title: 'Input activity' }, 720],
];

await fs.mkdir(GENERATED, { recursive: true });
await fs.mkdir(OUT_DIR, { recursive: true });

const entry = path.join(GENERATED, 'entry.ts');
await fs.writeFile(entry, `
import { DataStore } from '../../src/store';
import { renderEmbed } from '../../src/embed';
(window as any).TimeMdViz = { DataStore, renderEmbed };
`);

await esbuild.build({
  entryPoints: [entry],
  outfile: path.join(GENERATED, 'bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  plugins: [{
    name: 'obsidian-stub',
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian-stub', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        loader: 'js',
        contents: `
          export class Events { constructor(){ this._listeners = new Map(); } on(name, cb){ const list = this._listeners.get(name) || []; list.push(cb); this._listeners.set(name, list); return { name, cb }; } offref(ref){ const list = this._listeners.get(ref?.name) || []; this._listeners.set(ref.name, list.filter((cb) => cb !== ref.cb)); } trigger(name, ...args){ for (const cb of this._listeners.get(name) || []) cb(...args); } }
          export class MarkdownRenderChild { constructor(containerEl){ this.containerEl = containerEl; } registerEvent(){} }
          export class ItemView { constructor(leaf){ this.leaf = leaf; this.contentEl = document.createElement('div'); } getViewType(){ return ''; } getDisplayText(){ return ''; } async onOpen(){} async onClose(){} registerEvent(){} }
          export class WorkspaceLeaf {}
          export class Notice { constructor(message){ console.log('[Notice]', message); } }
          export class TAbstractFile {}
          export class TFile extends TAbstractFile {}
          export class TFolder extends TAbstractFile {}
          export class App {}
          export class Plugin {}
          export class PluginSettingTab {}
          export class Setting {}
          export const Platform = { isMobile: false };
        `,
      }));
    },
  }],
});

const cssFiles = [
  'styles.css',
  'src/views/projects.styles.css',
  'src/views/reports.styles.css',
  'src/views/webHistory.styles.css',
];
let css = '';
for (const rel of cssFiles) css += `\n/* ${rel} */\n` + await fs.readFile(path.join(ROOT, rel), 'utf8');
await fs.writeFile(path.join(GENERATED, 'style.css'), css);

const report = buildSampleReport();
await fs.writeFile(path.join(GENERATED, 'sample-data.js'), `window.TIMEMD_SAMPLE_REPORT = ${JSON.stringify(report)};\n`);

const html = `<!doctype html>
<html class="theme-dark">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="dark" />
<link rel="stylesheet" href="style.css" />
<style>
  :root, body {
    --background-primary: #000000;
    --background-primary-alt: #1a1a1a;
    --background-secondary: #0b0b0b;
    --background-modifier-border: #ffffff24;
    --background-modifier-hover: #1a1a1a;
    --text-normal: #ededed;
    --text-muted: #a0a0a0;
    --text-faint: #8f8f8f;
    --interactive-accent: #006efe;
    --color-accent: #006efe;
    --text-accent: #006efe;
    --timemd-accent: #006efe;
    --timemd-accent-hover: #005be7;
    --timemd-accent-muted: #06193a;
    --timemd-danger: #e2162a;
    --timemd-warning: #ff9300;
    --timemd-positive: #00ac3a;
    --timemd-heatmap-rgb: 0, 110, 254;
    --font-interface: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-monospace: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: #000; color: var(--text-normal); font-family: var(--font-interface); font-size: 14px; }
  body { padding: 24px; }
  #shot { width: min(var(--shot-width, 840px), calc(100vw - 48px)); margin: 0 auto; }
  .timemd-embed { box-shadow: 0 16px 44px rgba(0,0,0,.34); }
</style>
</head>
<body class="theme-dark">
<div id="shot" class="theme-dark"></div>
<script>
window.activeDocument = document;
window.activeWindow = window;
window.matchMedia = window.matchMedia || function(){ return { matches: true, media: '', addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){ return false; } }; };
const originalMatchMedia = window.matchMedia.bind(window);
window.matchMedia = (query) => query && query.includes('prefers-color-scheme') ? { matches: true, media: query, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){ return false; } } : originalMatchMedia(query);
function applyOpts(el, opts) {
  if (!opts) return el;
  if (typeof opts === 'string') { el.className = opts; return el; }
  if (opts.cls) for (const c of String(opts.cls).split(/\\s+/).filter(Boolean)) el.classList.add(c);
  if (opts.text !== undefined) el.textContent = String(opts.text);
  if (opts.type !== undefined) el.setAttribute('type', String(opts.type));
  if (opts.placeholder !== undefined) el.setAttribute('placeholder', String(opts.placeholder));
  if (opts.value !== undefined) el.value = String(opts.value);
  if (opts.attr) for (const [k,v] of Object.entries(opts.attr)) el.setAttribute(k, String(v));
  return el;
}
HTMLElement.prototype.createDiv = function(opts, cb) { const el = document.createElement('div'); applyOpts(el, opts); this.appendChild(el); if (cb) cb(el); return el; };
HTMLElement.prototype.createSpan = function(opts, cb) { const el = document.createElement('span'); applyOpts(el, opts); this.appendChild(el); if (cb) cb(el); return el; };
HTMLElement.prototype.createEl = function(tag, opts, cb) { const el = document.createElement(tag); applyOpts(el, opts); this.appendChild(el); if (cb) cb(el); return el; };
HTMLElement.prototype.empty = function() { this.replaceChildren(); };
HTMLElement.prototype.addClass = function(...classes) { for (const c of classes.flatMap((x) => String(x).split(/\\s+/))) if (c) this.classList.add(c); };
HTMLElement.prototype.removeClass = function(...classes) { for (const c of classes.flatMap((x) => String(x).split(/\\s+/))) if (c) this.classList.remove(c); };
HTMLElement.prototype.setAttr = function(name, value) { this.setAttribute(name, String(value)); };
HTMLElement.prototype.setText = function(text) { this.textContent = String(text); };
</script>
<script src="sample-data.js"></script>
<script src="bundle.js"></script>
<script>
(async () => {
  const search = new URLSearchParams(location.search);
  const view = search.get('view') || 'overview';
  const params = JSON.parse(search.get('params') || '{}');
  const width = Number(search.get('width') || '840');
  document.documentElement.style.setProperty('--shot-width', width + 'px');
  const store = new window.TimeMdViz.DataStore(null, () => '');
  store.reports = [window.TIMEMD_SAMPLE_REPORT];
  const el = document.getElementById('shot');
  el.classList.add('theme-dark');
  window.TimeMdViz.renderEmbed(el, store, { view, colorScheme: 'time-md', ...params });
  await document.fonts?.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__TIMEMD_READY = true;
})();
</script>
</body>
</html>`;
await fs.writeFile(path.join(GENERATED, 'index.html'), html);


class CDP {
  static async connect(url) { const ws = new WebSocket(url); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); return new CDP(ws); }
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); } else if (msg.method) { for (const fn of this.listeners.get(msg.method) || []) fn(msg.params); } }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(method, fn) { const list = this.listeners.get(method) || []; list.push(fn); this.listeners.set(method, list); }
  close() { this.ws.close(); }
}

const port = await findFreePort();
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(GENERATED, 'chrome-profile')}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

try {
  await waitForChrome(port);
  for (const [view, params, width] of views) {
    const url = `file://${path.join(GENERATED, 'index.html')}?view=${encodeURIComponent(view)}&width=${width}&params=${encodeURIComponent(JSON.stringify(params))}`;
    const target = await newTarget(port, url);
    const cdp = await CDP.connect(target.webSocketDebuggerUrl);
    try {
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: Math.max(width + 80, 960), height: 1400, deviceScaleFactor: 2, mobile: false });
      await waitReady(cdp);
      let rect = await evalJson(cdp, `(() => { const r = document.querySelector('#shot').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`);
      const height = Math.min(6000, Math.max(700, Math.ceil(rect.height + 80)));
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: Math.max(width + 80, 960), height, deviceScaleFactor: 2, mobile: false });
      await new Promise((r) => setTimeout(r, 120));
      rect = await evalJson(cdp, `(() => { const r = document.querySelector('#shot').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`);
      const clip = {
        x: Math.max(0, rect.x - 8),
        y: Math.max(0, rect.y - 8),
        width: Math.ceil(rect.width + 16),
        height: Math.ceil(rect.height + 16),
        scale: 1,
      };
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip });
      await fs.writeFile(path.join(OUT_DIR, `${view}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`wrote docs/assets/visualizations/dark/${view}.png`);
    } finally {
      await cdp.close();
      await closeTarget(port, target.id).catch(() => {});
    }
  }
} finally {
  chrome.kill('SIGTERM');
}

function buildSampleReport() {
  const apps = [
    ['Obsidian', 'Writing'], ['Safari', 'Research'], ['Xcode', 'Development'], ['Terminal', 'Development'],
    ['Slack', 'Communication'], ['Linear', 'Planning'], ['Figma', 'Design'], ['Mail', 'Communication'],
  ];
  const base = new Date('2026-06-16T00:00:00');
  const days = 14;
  const sessions = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(base); date.setDate(base.getDate() + d);
    const pattern = [
      ['Obsidian', 8, 30, 70 + (d % 3) * 12], ['Safari', 9, 55, 38 + (d % 4) * 7], ['Xcode', 10, 50, 95 + (d % 5) * 10],
      ['Terminal', 12, 45, 35 + (d % 2) * 16], ['Slack', 13, 50, 22 + (d % 4) * 5], ['Obsidian', 14, 25, 120 - (d % 3) * 10],
      ['Linear', 16, 55, 32 + (d % 3) * 9], ['Figma', 18, 5, 42 + (d % 2) * 15], ['Safari', 20, 15, 54 + (d % 5) * 8],
    ];
    if (d % 3 === 1) pattern.push(['Mail', 11, 30, 28], ['Slack', 15, 40, 18]);
    if (d % 4 === 2) pattern.push(['Terminal', 21, 25, 44]);
    for (const [app, h, m, minutes] of pattern) {
      const start = new Date(date); start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + minutes * 60 * 1000);
      sessions.push({ app_name: app, start_time: isoLocal(start), end_time: isoLocal(end), duration_seconds: minutes * 60 });
    }
  }
  const appTotals = sumBy(sessions, 'app_name');
  const catTotals = new Map();
  for (const [app, cat] of apps) catTotals.set(cat, (catTotals.get(cat) || 0) + (appTotals.get(app) || 0));
  const trendRows = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(base); date.setDate(base.getDate() + d);
    const key = date.toISOString().slice(0,10);
    const total = sessions.filter((s) => s.start_time.slice(0,10) === key).reduce((sum, s) => sum + s.duration_seconds, 0);
    trendRows.push({ date: key, total_seconds: total });
  }
  const heat = new Map();
  const dailyMatrix = [];
  const hourlyMatrix = [];
  for (const s of sessions) {
    const start = new Date(s.start_time);
    const weekday = ((start.getDay() + 6) % 7) + 1;
    const hkey = `${weekday}-${start.getHours()}`;
    heat.set(hkey, (heat.get(hkey) || 0) + s.duration_seconds);
    const category = apps.find(([a]) => a === s.app_name)?.[1] || 'Other';
    dailyMatrix.push({ date: s.start_time.slice(0,10), app_name: s.app_name, category, total_seconds: s.duration_seconds });
    hourlyMatrix.push({ date: s.start_time.slice(0,10), hour: start.getHours(), app_name: s.app_name, category, total_seconds: s.duration_seconds });
  }
  const transitions = [['Safari','Obsidian',42], ['Obsidian','Xcode',36], ['Xcode','Terminal',30], ['Terminal','Slack',22], ['Slack','Obsidian',28], ['Obsidian','Safari',26], ['Linear','Figma',14], ['Figma','Obsidian',12], ['Mail','Slack',10], ['Safari','Linear',8]].map(([from_app,to_app,count]) => ({ from_app, to_app, count }));
  const context = [];
  for (const t of trendRows) for (const h of [9, 10, 11, 13, 15, 17, 20]) context.push({ date: t.date, hour: h, switch_count: Math.round(3 + ((new Date(t.date).getDate() + h) % 8)) });
  const focus = trendRows.slice(-7).map((t, i) => ({ start_time: `${t.date}T${String(9+i%4).padStart(2,'0')}:00:00`, duration_seconds: 3600 + i * 420, app_name: i % 2 ? 'Xcode' : 'Obsidian', category: i % 2 ? 'Development' : 'Writing', interruptions: i % 3 }));
  const domains = ['github.com','developer.apple.com','docs.obsidian.md','timeprint.app','stackoverflow.com','linear.app','figma.com','youtube.com','news.ycombinator.com','vercel.com'];
  const browsing = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(base); d.setDate(base.getDate() + (i % days)); d.setHours(8 + (i * 3) % 14, (i * 17) % 60, 0, 0);
    const domain = domains[i % domains.length];
    browsing.push({ visit_time: isoLocal(d), url: `https://${domain}/article-${i+1}`, title: titleForDomain(domain), domain, browser: i % 3 === 0 ? 'Arc' : 'Safari' });
  }
  const topDomains = domains.map((domain, i) => ({ domain, visit_count: 22 - i, total_duration_seconds: (22 - i) * 95, last_visit_time: browsing.find((b) => b.domain === domain)?.visit_time || '2026-06-29T12:00:00' }));
  const typedWords = ['render','plugin','obsidian','timeline','export','session','focus','chart','theme','dark'].map((word, i) => ({ word, count: 150 - i * 11 }));
  const typedKeys = [['Space',1820],['Return',412],['Delete',388],['A',340],['C',322],['V',290],['E',250],['S',230]].map(([key_label,count], i) => ({ key_code: [49,36,51,0,8,9,14,1][i], key_label, count }));
  const bins = [];
  for (let x = 22; x <= 78; x += 7) for (let y = 18; y <= 48; y += 6) if ((x + y) % 3 !== 0) bins.push({ screen_id: 1, bin_x: x, bin_y: y, samples: 180 + ((x*y) % 980) });
  const intensity = [];
  for (let h = 6; h <= 22; h++) intensity.push({ timestamp: `2026-06-29T${String(h).padStart(2,'0')}:00:00`, keystrokes: Math.max(0, Math.round(80 + Math.sin(h / 1.5) * 220 + (h > 8 && h < 14 ? 450 : 0) + (h > 16 && h < 21 ? 360 : 0))) });
  const mouse = [];
  for (let i = 0; i < 60; i++) mouse.push({ timestamp: `2026-06-29T12:${String(i).padStart(2,'0')}:00`, app_name: apps[i % apps.length][0], bundle_id: '', kind: 1, button: 0, x: 300 + ((i * 73) % 1180), y: 200 + ((i * 53) % 620), screen_id: 1 });
  return {
    sourcePath: 'sample.json', sourceFormat: 'json', metadata: { title: 'time.md sample' },
    sections: [
      section('summary', ['metric','value'], [{ metric: 'total_seconds', value: [...appTotals.values()].reduce((a,b)=>a+b,0) }]),
      section('apps', ['app_name','total_seconds','session_count'], [...appTotals.entries()].map(([app,total]) => ({ app_name: app, total_seconds: total, session_count: sessions.filter((s) => s.app_name === app).length }))),
      section('categories', ['category','total_seconds'], [...catTotals.entries()].map(([category,total_seconds]) => ({ category, total_seconds }))),
      section('trend', ['date','total_seconds'], trendRows),
      section('heatmap', ['weekday','hour','total_seconds'], [...heat.entries()].map(([key,total_seconds]) => { const [weekday,hour]=key.split('-').map(Number); return { weekday, hour, total_seconds }; })),
      section('sessions', ['app_name','start_time','end_time','duration_seconds'], sessions),
      section('context_switches', ['date','hour','switch_count'], context),
      section('app_transitions', ['from_app','to_app','count'], transitions),
      section('focus_blocks', ['start_time','duration_seconds','app_name','category','interruptions'], focus),
      section('daily_matrix', ['date','app_name','category','total_seconds'], dailyMatrix),
      section('hourly_matrix', ['date','hour','app_name','category','total_seconds'], hourlyMatrix),
      section('period_comparison', ['metric','value'], [{metric:'current_total_seconds',value:56000},{metric:'previous_total_seconds',value:49200},{metric:'percent_change',value:13.8},{metric:'app_delta:Obsidian',value:5200},{metric:'app_delta:Safari',value:-2700},{metric:'app_delta:Xcode',value:4100},{metric:'app_delta:Slack',value:-1200}]),
      section('browsing_history', ['visit_time','url','title','domain','browser'], browsing),
      section('top_domains', ['domain','visit_count','total_duration_seconds','last_visit_time'], topDomains),
      section('input_top_words', ['word','count'], typedWords),
      section('input_top_keys', ['key_code','key_label','count'], typedKeys),
      section('input_cursor_heatmap', ['screen_id','bin_x','bin_y','samples'], bins),
      section('input_typing_intensity', ['timestamp','keystrokes'], intensity),
      section('input_raw_mouse_events', ['timestamp','app_name','bundle_id','kind','button','x','y','screen_id'], mouse),
    ],
  };
}
function section(name, headers, rows) { return { name, displayName: name.replace(/_/g, ' '), headers, rows }; }
function sumBy(rows, key) { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + r.duration_seconds); return new Map([...m.entries()].sort((a,b) => b[1]-a[1])); }
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`; }
function titleForDomain(domain) { if (domain.includes('github')) return 'Pull request review and issue triage'; if (domain.includes('developer')) return 'Apple developer documentation'; if (domain.includes('obsidian')) return 'Obsidian plugin API reference'; if (domain.includes('stackoverflow')) return 'TypeScript rendering answer'; if (domain.includes('figma')) return 'Design system review'; return `${domain} page`; }
function findFreePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, () => { const port = s.address().port; s.close(() => resolve(port)); }); s.on('error', reject); }); }
async function waitForChrome(port) { for (let i=0;i<80;i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('Chrome did not start'); }
async function newTarget(port, url) { const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }); if (!r.ok) throw new Error(`new target failed ${r.status}`); return r.json(); }
async function closeTarget(port, id) { await fetch(`http://127.0.0.1:${port}/json/close/${id}`); }
async function waitReady(cdp) { for (let i=0;i<100;i++) { const res = await cdp.send('Runtime.evaluate', { expression: 'window.__TIMEMD_READY === true', returnByValue: true }); if (res.result?.value === true) return; await new Promise(r => setTimeout(r, 100)); } const err = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }); throw new Error(`page not ready: ${err.result?.value}`); }
async function evalJson(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return JSON.parse(res.result.value); }
