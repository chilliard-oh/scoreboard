/* screenRIG Scoreboard · app
 * Views: home, setup, invite, join, controller, display, teams, history, summary.
 * State lives in an event log per game (see engine.js); this file renders it. */
(function () {
'use strict';
const E = window.SBEngine, Sync = window.SBSync;
const IN_ARTIFACT = Sync.IN_ARTIFACT;
const APP_URL = '__APP_URL__'.indexOf('__') === 0 ? '' : '__APP_URL__';

/* =============================================================== utils */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = o => esc(JSON.stringify(o));
const clampInt = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
function rid(n) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let r = null; try { r = crypto.getRandomValues(new Uint8Array(n)); } catch (e) {}
  let s = ''; for (let i = 0; i < n; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % a.length];
  return s;
}
function hexOk(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) { return rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function textOn(bg) { if (!hexOk(bg)) return '#ffffff'; return contrast(bg, '#ffffff') >= contrast(bg, '#0b0f16') ? '#ffffff' : '#0b0f16'; }
function fmtTime(ts) { const d = new Date(ts); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtStart(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m) return '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + m[2] + ' ' + ap;
}
function haptic() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
function groupCode(c) { return esc(c.slice(0, 3)) + '<span>·</span>' + esc(c.slice(3)); }

/* =============================================================== store */
const mem = {};
let storageWarned = false;
const Store = {
  get(k, d) {
    try { const v = localStorage.getItem('sb:' + k); if (v != null) return JSON.parse(v); } catch (e) {}
    return k in mem ? mem[k] : d;
  },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem('sb:' + k, JSON.stringify(v)); }
    catch (e) { if (!storageWarned) { storageWarned = true; setTimeout(() => toast('This browser is not saving data. Changes last until you close the page.', 'warn'), 50); } }
  },
  del(k) { delete mem[k]; try { localStorage.removeItem('sb:' + k); } catch (e) {} },
};

function guessDevice() {
  const ua = navigator.userAgent || '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/BrightSign/i.test(ua)) return 'BrightSign player';
  if (/AFT|AmazonWebAppPlatform|Silk/i.test(ua)) return 'Signage stick';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}
const DEVICE = (() => {
  let d = Store.get('device');
  if (!d || !d.id) { d = { id: 'd' + rid(10), name: guessDevice() }; Store.set('device', d); }
  return d;
})();
const CID = rid(6);   // one writer id per page load, so duplicated tabs never collide

/* =============================================================== icons */
const IC = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18h2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  eye: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 102.8-6.3L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/><path d="M12 7.5v4.5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  flag: '<path d="M5 21V4h12l-2.5 4L17 12H5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
};
const icon = (n, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>';
const SPORT_IC = {
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.7 5.6c2.9 2.7 2.9 10.1 0 12.8M18.3 5.6c-2.9 2.7-2.9 10.1 0 12.8"/>',
  volleyball: '<circle cx="12" cy="12" r="9"/><path d="M12 3c-.4 4.8 1.8 7.6 8.2 9.5"/><path d="M12 12c-4.2 2.6-7.6 2.3-9-.2"/><path d="M12 12c.9 4.7-.9 7.6-3.6 8.6"/><path d="M12 12c3.3-3.1 3.7-6.3 2.1-8.8"/>',
  soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z"/><path d="M12 8.2V3.5M15.6 10.8l4.3-1.4M14.2 15l2.7 3.7M9.8 15l-2.7 3.7M8.4 10.8L4.1 9.4"/>',
  football: '<path d="M4.6 19.4C2.9 14 4.6 8.8 8.3 6.2c3.3-2.3 7.7-2.6 11.1-1.6 1.7 5.4 0 10.6-3.7 13.2-3.3 2.3-7.7 2.6-11.1 1.6z"/><path d="M9.2 14.8l5.6-5.6M10.6 10.6l1.4 1.4M12.3 9.1l1.4 1.4M9.1 12.3l1.4 1.4"/>',
  hockey: '<path d="M6 3l7 12.5"/><path d="M13 15.5h6.5a1.5 1.5 0 010 3H12a2 2 0 01-1.7-1L3.5 4.5"/><ellipse cx="6.5" cy="19" rx="3" ry="1.4"/>',
  baseball: '<circle cx="12" cy="12" r="9"/><path d="M6.4 5.3c2.1 3.9 2.1 9.5 0 13.4M17.6 5.3c-2.1 3.9-2.1 9.5 0 13.4"/><path d="M7.4 8.2l1.6-.5M8.1 11.2h1.6M8.1 13.8h1.6M7.4 16.4l1.6.5M16.6 8.2l-1.6-.5M15.9 11.2h-1.6M15.9 13.8h-1.6M16.6 16.4l-1.6.5"/>',
};
const sportIcon = (id, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (SPORT_IC[id] || '') + '</svg>';
const ARROW_SVG = '<svg viewBox="0 0 80 50" aria-hidden="true"><path d="M2 25L30 2v14h48v18H30v14z" fill="currentColor"/></svg>';
const BALL_SVG = '<svg class="serve" viewBox="0 0 24 24" aria-label="Serving"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 2.5c-.5 5 1.8 8 8.5 9.8M12 12c-4.3 2.6-7.8 2.3-9.2-.2M12 12c.9 4.8-.9 7.8-3.7 8.8" stroke="var(--c1)" stroke-width="1.6" fill="none"/></svg>';
const FB_SVG = '<svg class="poss" viewBox="0 0 24 24" aria-label="Possession"><path d="M4.6 19.4C2.9 14 4.6 8.8 8.3 6.2c3.3-2.3 7.7-2.6 11.1-1.6 1.7 5.4 0 10.6-3.7 13.2-3.3 2.3-7.7 2.6-11.1 1.6z" fill="currentColor"/><path d="M9.5 14.5l5-5M10.8 10.8l1.4 1.4M12.4 9.3l1.4 1.4M9.3 12.4l1.4 1.4" stroke="var(--c1)" stroke-width="1.4"/></svg>';

/* ========================================================= team library */
const EXAMPLES = [
  { id: 'ex-ravens', name: 'Ridgeview Ravens', short: 'RVR', c1: '#1d2a5b', c2: '#f2b632', shape: 'shield', mono: 'R' },
  { id: 'ex-otters', name: 'Lakeside Otters', short: 'LKO', c1: '#0f7c86', c2: '#ead9b0', shape: 'round', mono: 'LO' },
  { id: 'ex-grizzlies', name: 'Granite Peak Grizzlies', short: 'GPG', c1: '#7a1f2b', c2: '#d9dde3', shape: 'hex', mono: 'GP' },
  { id: 'ex-tides', name: 'Harbour City Tides', short: 'HCT', c1: '#1f4fd1', c2: '#ffffff', shape: 'round', mono: 'HC' },
  { id: 'ex-owls', name: 'Cedar Valley Owls', short: 'CVO', c1: '#1e5b3a', c2: '#f1e6c8', shape: 'shield', mono: 'CV' },
  { id: 'ex-comets', name: 'North Shore Comets', short: 'NSC', c1: '#e2611b', c2: '#16181d', shape: 'hex', mono: 'NS' },
];
function monogram(t) {
  const c1 = hexOk(t.c1) ? t.c1 : '#334155', c2 = hexOk(t.c2) ? t.c2 : '#ffffff';
  const txt = esc(String(t.mono || t.short || '?').slice(0, 2).toUpperCase());
  const fs = txt.length > 1 ? 38 : 50;
  const shape = t.shape === 'round' ? '<circle cx="50" cy="50" r="44" fill="' + c1 + '" stroke="' + c2 + '" stroke-width="7"/><circle cx="50" cy="50" r="33" fill="none" stroke="' + c2 + '" stroke-width="2" opacity=".6"/>'
    : t.shape === 'hex' ? '<path d="M50 5l39 22.5v45L50 95 11 72.5v-45z" fill="' + c1 + '" stroke="' + c2 + '" stroke-width="7" stroke-linejoin="round"/>'
    : '<path d="M50 5l40 12v30c0 25-17 41-40 48C27 88 10 72 10 47V17z" fill="' + c1 + '" stroke="' + c2 + '" stroke-width="7" stroke-linejoin="round"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + shape + '<text x="50" y="' + (txt.length > 1 ? 63 : 67) + '" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="' + fs + '" fill="' + c2 + '">' + txt + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
let TEAMS = Store.get('teams');
if (!Array.isArray(TEAMS)) { TEAMS = EXAMPLES.map(t => Object.assign({}, t, { logo: monogram(t), example: true, sports: [] })); Store.set('teams', TEAMS); }
const saveTeams = () => Store.set('teams', TEAMS);
const teamById = id => TEAMS.find(t => t.id === id);
let PREFS = Store.get('prefs', {}) || {};
const savePrefs = () => Store.set('prefs', PREFS);

/* ============================================================ displays */
const ASPECTS = [
  { id: '16:9', w: 1920, h: 1080, label: '16:9', use: 'TV, wall display' },
  { id: '9:16', w: 1080, h: 1920, label: '9:16', use: 'Portrait kiosk' },
  { id: '4:3', w: 1600, h: 1200, label: '4:3', use: 'Older display' },
  { id: '21:9', w: 2560, h: 1080, label: '21:9', use: 'Ultra-wide' },
  { id: '32:9', w: 3840, h: 1080, label: '32:9', use: 'Video wall' },
  { id: 'ribbon', w: 3840, h: 240, label: 'Ribbon', use: 'Fascia LED' },
  { id: 'custom', w: 1920, h: 1080, label: 'Custom', use: 'Any pixel map' },
];
const FONTS = [['shoulders', 'Big Shoulders'], ['barlow', 'Barlow Condensed'], ['oswald', 'Oswald'], ['saira', 'Saira Condensed']];
const DISPLAY_DEFAULT = { aspect: '16:9', w: 1920, h: 1080, safe: 3, style: 'modern', mode: 'dark', bg: 'gradient', font: 'shoulders', anim: true };
function dispOf(game) { return Object.assign({}, DISPLAY_DEFAULT, (game && game.display) || {}); }
function dims(d) {
  if (d.aspect === 'custom') return { w: clampInt(d.w, 64, 7680, 1920), h: clampInt(d.h, 32, 4320, 1080) };
  const a = ASPECTS.find(x => x.id === d.aspect) || ASPECTS[0];
  return { w: a.w, h: a.h };
}
function classify(w, h) { const r = w / h; if (r >= 4) return 'ribbon'; if (r >= 2.05) return 'wide'; if (r >= 1.5) return 'land'; if (r >= 1.05) return 'compact'; return 'portrait'; }
function unitFor(cls, w, h) {
  if (cls === 'ribbon') return h / 100;
  if (cls === 'portrait') return Math.min(w / 56.25, h / 100);
  if (cls === 'compact') return Math.min(h / 100, w / 140);
  return Math.min(h / 100, w / 177.78);
}
const CLASS_NAME = { land: 'Landscape', wide: 'Wide', compact: 'Landscape compact', portrait: 'Portrait', ribbon: 'Ribbon' };
function viewingDistance(w, h, cls) {
  // Rough guide: a typical scoreboard digit is legible at ~100 x its height.
  // On a 55" 16:9 display, score digits are ~27 cm tall.
  const diag = cls === 'ribbon' ? 0 : 55;
  if (!diag) return 'Depends on the LED pitch';
  const hIn = diag * (h / Math.hypot(w, h));
  const digitM = hIn * 0.0254 * (cls === 'portrait' ? 0.2 : 0.4);
  return 'About ' + Math.round(digitM * 60) + ' m on a 55" screen';
}

/* =============================================================== board */
const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
const SEGP = (() => {
  const t = 11, g = 1.6, W = 60, H = 100;
  const hz = (y, x1, x2) => [x1, y, x1 + t / 2, y - t / 2, x2 - t / 2, y - t / 2, x2, y, x2 - t / 2, y + t / 2, x1 + t / 2, y + t / 2].join(' ');
  const vt = (x, y1, y2) => [x, y1, x + t / 2, y1 + t / 2, x + t / 2, y2 - t / 2, x, y2, x - t / 2, y2 - t / 2, x - t / 2, y1 + t / 2].join(' ');
  return { a: hz(t / 2, t / 2 + g, W - t / 2 - g), g: hz(H / 2, t / 2 + g, W - t / 2 - g), d: hz(H - t / 2, t / 2 + g, W - t / 2 - g), f: vt(t / 2, t / 2 + g, H / 2 - g), b: vt(W - t / 2, t / 2 + g, H / 2 - g), e: vt(t / 2, H / 2 + g, H - t / 2 - g), c: vt(W - t / 2, H / 2 + g, H - t / 2 - g) };
})();
function segSVG(text) {
  let x = 0, parts = '';
  for (const ch of String(text)) {
    if (ch === ':') { parts += '<circle cx="' + (x + 11) + '" cy="30" r="6.5"/><circle cx="' + (x + 9) + '" cy="70" r="6.5"/>'; x += 22; continue; }
    if (ch === '.') { parts += '<circle cx="' + (x + 6) + '" cy="93" r="6.5"/>'; x += 16; continue; }
    const on = SEG[ch];
    if (on === undefined) continue;
    parts += '<g transform="translate(' + x + ' 0) skewX(-5)">' + 'abcdefg'.split('').map(s => '<polygon points="' + SEGP[s] + '"' + (on.indexOf(s) >= 0 ? '' : ' class="off"') + '/>').join('') + '</g>';
    x += 70;
  }
  const w = Math.max(1, x - 6);
  return '<svg class="segd" viewBox="-4 -1 ' + (w + 8) + ' 102" style="width:' + ((w + 8) / 102 * 0.78).toFixed(3) + 'em" fill="currentColor" aria-label="' + esc(text) + '">' + parts + '</svg>';
}
function digits(text, led) {
  text = String(text);
  if (led && /^[0-9:. -]*$/.test(text)) return segSVG(text);
  let out = '';
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += '<span class="dg">' + ch + '</span>';
    else if (ch === ':') out += '<span class="dc">:</span>';
    else if (ch === '.') out += '<span class="dd">.</span>';
    else out += esc(ch);
  }
  return out;
}
function qrSVG(text) {
  try {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  } catch (e) { return ''; }
}
function appBase() {
  if (APP_URL) return APP_URL.replace(/#.*$/, '');
  if (IN_ARTIFACT) return '';
  return location.href.replace(/#.*$/, '');
}
function joinUrl(code, role) { const b = appBase(); return b ? b + '#' + (role === 'display' ? 'display-' : 'join-') + code : ''; }

function boardHTML(game, S, t, opts) {
  opts = opts || {};
  const d = dispOf(game), dm = dims(d), cls = classify(dm.w, dm.h), u = unitFor(cls, dm.w, dm.h);
  const m = E.boardModel(game, S, t);
  const ctx = { game, S, t, cls, led: d.style === 'led', showJoin: !!opts.showJoin };
  const pad = Math.round(Math.min(dm.w, dm.h) * clampInt(d.safe, 0, 20, 3) / 100);
  const h = m.teams.home, a = m.teams.away;
  let inner;
  if (S.phase === 'pre') inner = preScreen(m, ctx);
  else if (S.phase === 'break' || S.phase === 'final') inner = endScreen(m, ctx);
  else inner = m.kind === 'baseball' ? baseballBoard(m, ctx) : standardBoard(m, ctx);
  if (S.phase !== 'pre' && ctx.showJoin) inner += joinPanel(ctx);
  const font = { barlow: 'f-barlow', oswald: 'f-oswald', saira: 'f-saira' }[d.font] || '';
  const classes = ['bd', 'bd-' + cls, d.mode === 'light' ? 'light' : 'dark', d.style === 'led' ? 'led' : '', d.bg === 'gradient' ? 'grad' : '', d.anim === false ? 'noanim' : '', font].filter(Boolean).join(' ');
  return '<div class="' + classes + '" data-w="' + dm.w + '" data-h="' + dm.h + '" style="width:' + dm.w + 'px;height:' + dm.h + 'px;--u:' + u.toFixed(3) + 'px;--hc:' + h.c1 + ';--ac:' + a.c1 + '">' +
    '<div class="bd-safe" style="inset:' + pad + 'px">' + inner + '</div><i class="bd-net" data-net hidden></i></div>';
}
function teamVars(t) { return '--c1:' + (hexOk(t.c1) ? t.c1 : '#334155') + ';--c2:' + (hexOk(t.c2) ? t.c2 : '#e2e8f0') + ';--tf:' + textOn(t.c1); }
function logoImg(t, cls) { return t.logo ? '<img class="' + cls + '" src="' + esc(t.logo) + '" alt="">' : ''; }
function nameFor(t, cls) { return cls === 'ribbon' ? t.short : t.name; }
function standardBoard(m, ctx) {
  return '<div class="play">' + teamHTML(m, 'home', ctx) + centerHTML(m, ctx) + teamHTML(m, 'away', ctx) + stripHTML(m, ctx) + '</div>';
}
function teamHTML(m, side, ctx) {
  const t = m.teams[side];
  const icons = (t.serve ? BALL_SVG : '') + (t.poss ? FB_SVG : '');
  let meta = (t.meta || []).map(x => {
    if (x.dots != null) {
      const full = Math.max(0, Math.min(9, x.dots | 0)), sh = Math.max(0, Math.min(5, x.dots2 | 0));
      return '<span><span class="k">' + esc(x.k) + '</span>' + (full + sh ? '<span class="dots">' + '<i></i>'.repeat(full) + '<i class="s"></i>'.repeat(sh) + '</span>' : '<span class="v">0</span>') + '</span>';
    }
    return '<span><span class="k">' + esc(x.k) + '</span><span class="v">' + esc(x.v) + '</span></span>';
  });
  if (t.cards && (t.cards.y || t.cards.r)) meta.push('<span class="cards">' + (t.cards.y ? '<i class="card y"></i><b>' + t.cards.y + '</b>' : '') + (t.cards.r ? '<i class="card r"></i><b>' + t.cards.r + '</b>' : '') + '</span>');
  const tags = (t.tags || []).map(x => '<span class="btag' + (x.tone === 'warn' || x.card ? ' warn' : '') + '">' + (x.card ? '<i class="card ' + (x.card === 'R' ? 'r' : 'y') + '"></i>' : '') + esc(x.t) + '</span>')
    .concat((t.flags || []).map(f => '<span class="btag flagout">' + esc(f) + '</span>'));
  const pens = (t.pens || []).length ? '<div class="bpens">' + t.pens.map(p => '<span class="pen"><span>#' + esc(p.n || '?') + '</span><b data-live="' + esc(p.live) + '" data-spec="{}"></b></span>').join('') + '</div>' : '';
  return '<section class="tm ' + side + '" style="' + teamVars(t) + '">' +
    '<header class="band">' + logoImg(t, 'logo') + '<span class="name" data-fit data-fitgroup="band" data-short="' + esc(t.short) + '">' + esc(nameFor(t, ctx.cls)) + '</span>' + icons + '</header>' +
    '<div class="score" data-score="' + side + '">' + digits(t.score, ctx.led) + '</div>' +
    '<div class="info">' + (t.big ? '<div class="big2"><b>' + esc(t.big.v) + '</b><span>' + esc(t.big.k) + '</span></div>' : '') +
    '<div class="meta">' + meta.join('') + '</div>' +
    '<div class="tags">' + tags.join('') + '</div>' + pens + '</div></section>';
}
function liveAttr(key, spec) { return ' data-live="' + esc(key) + '" data-spec="' + attr(spec || {}) + '" data-dg="1"'; }
function centerHTML(m, ctx) {
  const c = m.center || {};
  let h = '<section class="ctr"><div class="period">' + esc(m.period.short) + '</div>';
  if (c.clock) {
    const spec = { tenths: !!c.clock.tenths, offset: c.clock.offset || 0 };
    h += '<div class="clock' + (c.clock.small ? ' small' : '') + '"' + liveAttr(c.clock.key, spec) + '>' + digits(E.liveText(ctx.game, ctx.S, c.clock.key, ctx.t, spec), ctx.led) + '</div>';
  }
  if (c.subs && c.subs.length) h += '<div class="subs">' + c.subs.map(s => '<div class="sub" data-subwrap><span>' + esc(s.label) + '</span><b' + liveAttr(s.key, s) + '></b></div>').join('') + '</div>';
  if (c.badge) h += '<div class="bdg">' + esc(c.badge) + '</div>';
  if (c.alert) h += '<div class="alertx">' + esc(c.alert) + '</div>';
  if (c.arrow) h += '<div class="arrow ' + (c.arrow === 'away' ? 'away' : 'home') + '">' + (c.arrow === 'away' ? '<span>POSS</span>' + ARROW_SVG : ARROW_SVG + '<span>POSS</span>') + '</div>';
  return h + '</section>';
}
function kicksHTML(arr, rounds) {
  let s = '';
  const n = Math.max(rounds, arr.length);
  for (let i = 0; i < n; i++) s += '<i class="' + (i < arr.length ? (arr[i] ? 'y' : 'n') : '') + '"></i>';
  return '<span class="kk">' + s + '</span>';
}
function stripHTML(m, ctx) {
  const s = m.strip;
  if (!s) return '';
  if (s.kind === 'items') return '<footer class="strip">' + s.items.map(x => '<span class="it"><span>' + esc(x.k) + '</span><b>' + esc(x.v) + '</b></span>').join('') + (s.flag ? '<span class="flagx">FLAG</span>' : '') + '</footer>';
  if (s.kind === 'sets') return '<footer class="strip"><span class="sets">' + s.items.map(x => '<span class="it"><span>Set ' + x.n + '</span><b>' + x.home + '–' + x.away + '</b></span>').join('') + '</span></footer>';
  if (s.kind === 'shootout') {
    const so = s.so, T = m.teams;
    return '<footer class="strip"><span class="it kkrow"><span>' + esc(T.home.short) + '</span>' + kicksHTML(so.k.home, so.rounds) + '</span>' +
      '<span class="it"><b>' + so.k.home.filter(Boolean).length + '–' + so.k.away.filter(Boolean).length + '</b></span>' +
      '<span class="it kkrow"><span>' + esc(T.away.short) + '</span>' + kicksHTML(so.k.away, so.rounds) + '</span></footer>';
  }
  return '';
}
function diamondSVG(b) {
  const sq = (x, y, on) => '<rect x="' + (x - 13) + '" y="' + (y - 13) + '" width="26" height="26" transform="rotate(45 ' + x + ' ' + y + ')"' + (on ? ' class="on"' : '') + '/>';
  return '<svg class="dia" viewBox="0 0 120 88" aria-label="Runners">' + sq(60, 22, b[1]) + sq(96, 56, b[0]) + sq(24, 56, b[2]) + '</svg>';
}
function baseballBoard(m, ctx) {
  const n = m.innings, maxCols = ctx.cls === 'portrait' ? 6 : ctx.cls === 'compact' ? 9 : 12;
  const start = n <= maxCols ? 1 : Math.max(1, Math.min(n, Math.max(m.inning, maxCols)) - maxCols + 1), cols = [];
  for (let i = start; i <= Math.min(n, start + maxCols - 1); i++) cols.push(i);
  const row = side => {
    const t = m.teams[side];
    const cells = cols.map(i => {
      const v = m.line[side][i - 1], played = v !== undefined;
      const cur = i === m.inning && m.bat === side && m.phase === 'live';
      return '<td class="' + (played ? '' : 'empty') + (cur ? ' cur' : '') + '">' + (played ? v : '') + '</td>';
    }).join('');
    return '<tr class="' + (m.bat === side ? 'bat' : '') + '" style="' + teamVars(t) + '"><td class="tn"><div class="in">' + logoImg(t, 'logo') + '<span data-fit data-fitgroup="line" data-short="' + esc(t.short) + '">' + esc(ctx.cls === 'land' || ctx.cls === 'wide' ? t.name : t.short) + '</span></div></td>' + cells +
      '<td class="R">' + digits(t.score, ctx.led) + '</td><td class="HE">' + m.hits[side] + '</td><td class="HE last">' + m.errors[side] + '</td></tr>';
  };
  const nameW = ctx.cls === 'portrait' ? 30 : ctx.cls === 'compact' ? 30 : 32;
  const table = '<table class="line bbline"><colgroup><col style="width:' + nameW + '%">' + cols.map(() => '<col>').join('') + '<col style="width:10%"><col style="width:6%"><col style="width:6%"></colgroup>' +
    '<thead><tr><th></th>' + cols.map(i => '<th>' + i + '</th>').join('') + '<th>R</th><th>H</th><th>E</th></tr></thead><tbody>' + row('away') + row('home') + '</tbody></table>';
  const lights = (n2, k, cls) => '<span class="l ' + cls + '">' + Array.from({ length: n2 }, (_, i) => '<i class="' + (i < k ? 'on' : '') + '"></i>').join('') + '</span>';
  const rbTeam = side => { const t = m.teams[side]; return '<section class="tm ' + side + '" style="' + teamVars(t) + '"><header class="band">' + logoImg(t, 'logo') + '<span class="name">' + esc(t.short) + '</span></header><div class="score">' + digits(t.score, ctx.led) + '</div></section>'; };
  const subs = (m.center.subs || []).map(s => '<div class="sub" data-subwrap><span>' + esc(s.label) + '</span><b' + liveAttr(s.key, s) + '></b></div>').join('');
  const gameClock = m.center.clock ? '<div class="clock small"' + liveAttr('game', {}) + '></div>' : '';
  return '<div class="bb">' + table + '<div class="rb">' + rbTeam('away') + rbTeam('home') + '</div>' +
    '<aside class="bbside"><div class="inn"><i class="tri ' + (m.half === 'top' ? 'top' : 'bot') + '"></i>' + esc(E.ord(m.inning).toUpperCase()) + '</div>' +
    '<div class="bso"><span>B</span>' + lights(3, m.balls, 'b') + '<span>S</span>' + lights(2, m.strikes, 's') + '<span>O</span>' + lights(2, m.outs, 'o') + '</div>' +
    diamondSVG(m.bases) + (m.pitch.n || m.pitch.count ? '<div class="pc">Pitcher ' + (m.pitch.n ? '#' + esc(m.pitch.n) + ' ' : '') + '<b>' + m.pitch.count + '</b> pitches</div>' : '') +
    (subs ? '<div class="subs">' + subs + '</div>' : '') + gameClock + '</aside></div>';
}
function preScreen(m, ctx) {
  const g = ctx.game, sp = E.SPORTS[g.sport], pr = sp.presets.find(p => p.id === g.presetId);
  const team = side => {
    const t = m.teams[side];
    return '<div class="scr-team" style="' + teamVars(t) + '">' + logoImg(t, 'scr-logo') + '<div class="scr-name" data-fit data-fitgroup="scr" data-short="' + esc(t.short) + '">' + esc(nameFor(t, ctx.cls)) + '</div><div class="scr-bar"></div></div>';
  };
  const when = fmtStart(g.start);
  const info = [sp.name.split(' /')[0], pr ? pr.org : ''].filter(Boolean).join(' · ') + (g.venue ? '<br>' + esc(g.venue) : '');
  return '<div class="scr">' + team('home') + '<div class="scr-mid"><div class="scr-vs">VS</div>' + (when ? '<div class="scr-when">' + esc(when) + '</div>' : '') + '<div class="scr-info">' + info + '</div></div>' + team('away') + '</div>' + (ctx.showJoin ? joinPanel(ctx) : '');
}
function joinPanel(ctx) {
  const url = joinUrl(ctx.game.code, 'controller');
  const qr = url && ctx.cls !== 'ribbon' ? qrSVG(url) : '';
  return '<div class="join">' + (qr ? '<div class="q">' + qr + '</div>' : '') + '<div class="t"><span>Scorekeeper code</span><b>' + esc(ctx.game.code) + '</b></div></div>';
}
function endScreen(m, ctx) {
  const S = ctx.S, final = S.phase === 'final';
  const loser = final && m.winner ? E.opp(m.winner) : null;
  const team = side => {
    const t = m.teams[side];
    return '<div class="scr-team' + (side === loser ? ' lose' : '') + '" style="' + teamVars(t) + '">' + logoImg(t, 'scr-logo') + '<div class="scr-name" data-fit data-fitgroup="scr" data-short="' + esc(t.short) + '">' + esc(nameFor(t, ctx.cls)) + '</div><div class="scr-score">' + digits(t.score, ctx.led) + '</div></div>';
  };
  const b = m.breakdown, showTable = b && b.cols.length && ctx.cls !== 'ribbon';
  const maxCols = ctx.cls === 'portrait' ? 7 : 12;
  let table = '';
  if (showTable) {
    const from = Math.max(0, b.cols.length - maxCols), cols = b.cols.slice(from);
    const r = side => '<tr><td>' + esc(m.teams[side].short) + '</td>' + b.rows[side].slice(from).map(v => '<td>' + (v == null ? '' : v) + '</td>').join('') + b.tails[side].map(v => '<td class="t">' + v + '</td>').join('') + '</tr>';
    const first = m.kind === 'baseball' ? 'away' : 'home';
    table = '<table class="bdown"><thead><tr><th></th>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + b.tail.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + r(first) + r(E.opp(first)) + '</tbody></table>';
  }
  const title = final ? m.status : m.status || '';
  const clock = !final && m.breakClock ? '<div class="scr-clock"' + liveAttr('brk', {}) + '></div>' : '';
  const L = m.kind === 'baseball' ? 'away' : 'home', Rr = E.opp(L);
  return '<div class="scr">' + team(L) + '<div class="scr-mid"><div class="scr-title' + (final ? ' final' : '') + '">' + esc(title) + '</div>' + clock + table + '</div>' + team(Rr) + '</div>';
}
/* Mount a board into a container and scale it to fit. */
function mountBoard(box, game, S, opts) {
  opts = opts || {};
  const prev = box._scores;
  box.innerHTML = boardHTML(game, S, opts.static ? Date.now() : now(), opts);
  const bd = box.firstElementChild;
  box._scores = { home: S.score.home, away: S.score.away };
  fitStage(box);
  fitText(bd);
  if (prev) ['home', 'away'].forEach(s => { if (prev[s] !== S.score[s]) $$('[data-score="' + s + '"]', bd).forEach(el => el.classList.add('bump')); });
  if (opts.static) { tickBox(box, game, S, Date.now()); $$('[data-live]', box).forEach(el => el.removeAttribute('data-live')); }
  else tickBox(box);
  if (!box._ro && typeof ResizeObserver !== 'undefined') { box._ro = new ResizeObserver(() => fitStage(box)); box._ro.observe(box); }
}
function fitStage(box) {
  const bd = box.querySelector('.bd'); if (!bd) return;
  const w = +bd.dataset.w, h = +bd.dataset.h, cw = box.clientWidth, ch = box.clientHeight;
  if (!cw || !ch) return;
  const s = Math.min(cw / w, ch / h);
  bd.style.transform = 'translate(' + ((cw - w * s) / 2).toFixed(1) + 'px,' + ((ch - h * s) / 2).toFixed(1) + 'px) scale(' + s.toFixed(5) + ')';
}
/* Shrink names to fit; if one name in a group has to fall back to its short
   form, both teams switch so the board stays symmetrical. */
function fitText(root) {
  const shrink = el => {
    el.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(el).fontSize), min = fs * 0.6, i = 0;
    while (el.scrollWidth > el.clientWidth + 1 && fs > min && i++ < 24) { fs *= 0.93; el.style.fontSize = fs.toFixed(1) + 'px'; }
    return el.scrollWidth <= el.clientWidth + 1;
  };
  const toShort = el => { if (el.dataset.short && el.textContent !== el.dataset.short) { el.textContent = el.dataset.short; shrink(el); } };
  const groups = {};
  $$('[data-fit]', root).forEach(el => {
    if (!shrink(el)) { const g = el.dataset.fitgroup; if (g) groups[g] = true; else toShort(el); }
  });
  Object.keys(groups).forEach(g => $$('[data-fitgroup="' + g + '"]', root).forEach(toShort));
  // equalise sizes inside a group so both names match
  const sizes = {};
  $$('[data-fitgroup]', root).forEach(el => { const g = el.dataset.fitgroup, f = parseFloat(getComputedStyle(el).fontSize); sizes[g] = Math.min(sizes[g] || 1e9, f); });
  $$('[data-fitgroup]', root).forEach(el => { el.style.fontSize = sizes[el.dataset.fitgroup].toFixed(1) + 'px'; });
}

/* ================================================================ live */
function liveTextFor(el, S, game, t) {
  let spec = el._spec;
  if (!spec) { try { spec = el._spec = JSON.parse(el.dataset.spec || '{}'); } catch (e) { spec = el._spec = {}; } }
  const key = el.dataset.live;
  const wrap = el.closest('[data-subwrap]');
  if (wrap && S.clocks[key]) {
    let hide = false;
    if (spec.onlyRunning) hide = !E.clockRunning(S, key);
    if (spec.hideBelowGame && S.clocks.game) { const gv = E.clockValue(S, 'game', t), sv = E.clockValue(S, key, t); hide = gv > 0 && gv < sv; }
    if (wrap.hidden !== hide) wrap.hidden = hide;
  } else if (wrap && !S.clocks[key]) wrap.hidden = true;
  return E.liveText(game, S, key, t, spec);
}
function tickBox(root, game, S, t) {
  game = game || G.game; S = S || (G.R && G.R.S);
  if (!game || !S) return;
  t = t || now();
  $$('[data-live]', root).forEach(el => {
    const txt = liveTextFor(el, S, game, t);
    if (el._txt === txt) return;
    el._txt = txt;
    if (el.dataset.dg) el.innerHTML = digits(txt, !!el.closest('.bd.led'));
    else el.textContent = txt;
    if (el.dataset.zero !== undefined) el.classList.toggle('zero', /^0(:00|\.0)?$/.test(txt));
  });
}
let lastZeroKey = '';
function tick() {
  requestAnimationFrame(tick);
  if (!G.game || !G.R) return;
  tickBox(document);
  const S = G.R.S, gc = S.clocks.game;
  if (gc) {
    const z = S.phase === 'live' && gc.run && E.clockValue(S, 'game', now()) <= 0;
    const key = z ? G.game.id + ':' + S.period + ':' + gc.t0 : '';
    if (key && key !== lastZeroKey) { lastZeroKey = key; onClockZero(); }
  }
}
function onClockZero() {
  $$('.bd .clock').forEach(el => { el.classList.remove('flash-z'); void el.offsetWidth; el.classList.add('flash-z'); });
  if (ROUTE.v === 'control') render();
}

/* ============================================================ session */
const G = { game: null, events: [], R: null, link: null, role: 'controller', status: null, waitingJoin: null, preview: Store.get('preview', true), showJoin: false, unsub: null };
function now() { return Date.now() + (G.link ? G.link.offset : (G.offset || 0)); }
function sanitizeTeam(t, side) {
  t = t && typeof t === 'object' ? t : {};
  const logo = typeof t.logo === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/.test(t.logo) && t.logo.length < 600000 ? t.logo : null;
  return {
    id: String(t.id || side).slice(0, 40), name: String(t.name || (side === 'home' ? 'Home' : 'Away')).slice(0, 48),
    short: String(t.short || (side === 'home' ? 'HOME' : 'AWAY')).slice(0, 5).toUpperCase(),
    c1: hexOk(t.c1) ? t.c1 : '#334155', c2: hexOk(t.c2) ? t.c2 : '#e2e8f0', logo: logo,
  };
}
function sanitizeGame(g) {
  if (!g || typeof g !== 'object' || !E.SPORTS[g.sport] || typeof g.code !== 'string') return null;
  const sp = E.SPORTS[g.sport];
  const presetId = sp.presets.some(p => p.id === g.presetId) ? g.presetId : sp.presets[0].id;
  const disp = Object.assign({}, DISPLAY_DEFAULT);
  if (g.display && typeof g.display === 'object') {
    if (ASPECTS.some(a => a.id === g.display.aspect)) disp.aspect = g.display.aspect;
    disp.w = clampInt(g.display.w, 64, 7680, 1920); disp.h = clampInt(g.display.h, 32, 4320, 1080);
    disp.safe = clampInt(g.display.safe, 0, 20, 3);
    disp.style = g.display.style === 'led' ? 'led' : 'modern';
    disp.mode = g.display.mode === 'light' ? 'light' : 'dark';
    disp.bg = g.display.bg === 'solid' ? 'solid' : 'gradient';
    disp.font = FONTS.some(f => f[0] === g.display.font) ? g.display.font : 'shoulders';
    disp.anim = g.display.anim !== false;
  }
  return {
    id: String(g.id || ('g' + rid(8))).slice(0, 40), code: g.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    rev: clampInt(g.rev, 1, 1e9, 1), updatedAt: Number(g.updatedAt) || 0, createdAt: Number(g.createdAt) || 0,
    timebase: typeof g.timebase === 'string' ? g.timebase.slice(0, 40) : null,
    sport: g.sport, presetId: presetId, rulesVersion: String(g.rulesVersion || E.RULES_VERSION).slice(0, 24),
    rules: E.resolveRules(g.sport, presetId, g.rules || {}),
    teams: { home: sanitizeTeam(g.teams && g.teams.home, 'home'), away: sanitizeTeam(g.teams && g.teams.away, 'away') },
    display: disp, venue: String(g.venue || '').slice(0, 60), start: /^\d{1,2}:\d{2}$/.test(g.start || '') ? g.start : '', pin: /^\d{0,6}$/.test(g.pin || '') ? (g.pin || '') : '',
  };
}
function cleanEv(e) {
  return { id: e.id, c: e.c, n: e.n, at: e.at, t: e.t, p: e.p && typeof e.p === 'object' ? e.p : {}, d: String(e.d || '').slice(0, 40), r: String(e.r || '').slice(0, 12) };
}
function recompute() { G.R = E.replay(G.game, G.events); }
function persist() {
  if (!G.game) return;
  Store.set('game.' + G.game.id, { game: G.game, events: G.events, offset: G.link ? G.link.offset : (G.offset || 0) });
  const idx = Store.get('games', []).filter(x => x.id !== G.game.id);
  const S = G.R ? G.R.S : null;
  idx.unshift({
    id: G.game.id, code: G.game.code, sport: G.game.sport, updatedAt: Date.now(), createdAt: G.game.createdAt,
    home: { name: G.game.teams.home.name, short: G.game.teams.home.short, c1: G.game.teams.home.c1 },
    away: { name: G.game.teams.away.name, short: G.game.teams.away.short, c1: G.game.teams.away.c1 },
    score: S ? S.score : { home: 0, away: 0 }, phase: S ? S.phase : 'pre', winner: S ? S.winner : null,
  });
  Store.set('games', idx.slice(0, 80));
}
function loadGame(id) { const rec = Store.get('game.' + id); if (!rec || !rec.game) return null; return rec; }
function startLink() {
  stopLink();
  G.link = new Sync.Link({
    code: G.game ? G.game.code : G.waitingJoin.code, cid: CID, dev: DEVICE.id, name: DEVICE.name, role: G.role,
    offset: G.offset || 0,
    getGame: () => G.game, getEvents: () => G.events,
    onDef: onRemoteDef, onEvents: onRemoteEvents,
    onStatus: st => { G.status = st; paintStatus(); },
    onOffset: () => persist(),
  }).start();
}
function stopLink() { if (G.link) { G.link.stop(); G.link = null; } }
function openGame(id, role, view) {
  const rec = loadGame(id);
  if (!rec) { toast('That game is no longer on this device.', 'alert'); return go('home'); }
  closeGame(true);
  G.game = sanitizeGame(rec.game) || rec.game;
  G.events = (rec.events || []).filter(Sync.validEv).map(cleanEv);
  G.offset = Number(rec.offset) || 0;
  G.role = role === 'display' ? 'display' : (role || 'controller');
  recompute();
  startLink();
  go(view || (role === 'display' ? 'display' : 'control'));
}
function closeGame(silent) {
  stopLink();
  G.game = null; G.events = []; G.R = null; G.waitingJoin = null; G.status = null; G.showJoin = false;
  if (!silent) Store.set('active', null);
}
function nextN() { let m = 0; for (const e of G.events) if (e.c === CID && e.n > m) m = e.n; return m + 1; }
function dispatch(t, p) {
  if (!G.game) return null;
  const n = nextN();
  const ev = { id: CID + '.' + n, c: CID, n: n, at: now(), t: t, p: p || {}, d: DEVICE.name, r: G.role };
  G.events.push(ev);
  const before = G.R;
  recompute(); persist();
  announce(before, [ev], true);
  if (G.link) G.link.sendEvents([ev]);
  haptic();
  render(); refreshSheet();
  return ev;
}
function onRemoteEvents(evs) {
  if (!G.game) { G.pending = (G.pending || []).concat(evs); return; }
  const have = new Set(G.events.map(e => e.id));
  const fresh = evs.filter(e => !have.has(e.id)).map(cleanEv);
  if (!fresh.length) return;
  G.events.push.apply(G.events, fresh);
  const before = G.R;
  recompute(); persist();
  announce(before, fresh, false);
  render(); refreshSheet();
}
function onRemoteDef(def) {
  const g = sanitizeGame(def);
  if (!g) return;
  if (G.waitingJoin && !G.game && g.code === G.waitingJoin.code) {
    G.game = g; G.events = (G.pending || []).filter(Sync.validEv).map(cleanEv); G.pending = null;
    recompute(); persist();
    const w = G.waitingJoin;
    setTimeout(() => { if (G.waitingJoin === w) finishJoin(); }, 700);
    render();
    return;
  }
  if (!G.game || g.code !== G.game.code) return;
  if (g.rev > G.game.rev || (g.rev === G.game.rev && g.updatedAt > G.game.updatedAt)) {
    G.game = Object.assign(g, { id: G.game.id });
    recompute(); persist(); render();
  }
}
/* Toasts for rule notes, alerts, and state-setting actions from other devices. */
function announce(before, evs, local) {
  if (!G.R) return;
  const byId = {};
  G.R.log.forEach(e => { byId[e.ev.id] = e; });
  evs.forEach(ev => {
    const e = byId[ev.id];
    if (!e) return;
    if (local && e.rej) { toast(e.rej, 'alert'); return; }
    if (e.alert) toast(e.note, 'alert');
    else if (local && e.note && ev.t !== 'start' && ev.t !== 'nextp' && ev.t !== 'endp') toast(e.note);
    else if (!local && !e.rej && ((ev.t === 'clock' && (ev.p.a === 'set' || ev.p.a === 'adj')) || ev.t === 'set' || ev.t === 'undo')) {
      if (G.role !== 'display') toast(e.desc + ' · by ' + (ev.d || 'another device'), 'warn');
    }
  });
}
function updateDef(mut) {
  const g = JSON.parse(JSON.stringify(G.game));
  mut(g);
  g.rev = (g.rev || 1) + 1; g.updatedAt = Date.now();
  G.game = sanitizeGame(g) || g;
  G.game.id = g.id;
  recompute(); persist();
  if (G.link) G.link.send({ k: 'def', game: G.game });
  render();
}

/* ============================================================== router */
let ROUTE = { v: 'home' };
function go(v, params) {
  ROUTE = Object.assign({ v: v }, params || {});
  closeSheet();
  if (G.game && (v === 'control' || v === 'display')) Store.set('active', { id: G.game.id, role: v === 'display' ? 'display' : G.role });
  else if (v === 'home') { const a = Store.get('active'); if (a) Store.set('active', { id: a.id, role: null }); }
  document.body.classList.toggle('is-display', v === 'display');
  render(true);
  if (v !== 'display') try { window.scrollTo(0, 0); } catch (e) {}
  if (v === 'display') requestWake(); else releaseWake();
}
let renderQueued = false;
function render(sync) {
  if (sync) return doRender();
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(); });
}
function doRender() {
  const app = $('#app');
  const v = ROUTE.v;
  const keepScroll = (v === 'control' || v === 'setup') ? window.scrollY : 0;
  let html;
  switch (v) {
    case 'setup': html = viewSetup(); break;
    case 'invite': html = viewInvite(); break;
    case 'join': html = viewJoin(); break;
    case 'control': html = G.game ? viewControl() : viewHome(); break;
    case 'display': html = G.game ? viewDisplay() : viewHome(); break;
    case 'teams': html = viewTeams(); break;
    case 'history': html = viewHistory(); break;
    case 'summary': html = viewSummary(); break;
    default: html = viewHome();
  }
  if (v === 'display' && $('#disp') && G.game) {
    paintDisplay();
  } else {
    app.innerHTML = html;
    afterRender();
  }
  if (keepScroll) window.scrollTo(0, keepScroll);
  paintStatus();
}
function afterRender() {
  $$('[data-board]').forEach(box => {
    const kind = box.dataset.board;
    if (kind === 'setup') return mountBoard(box, DRAFT_GAME(), sampleState(DRAFT_GAME()), { static: true });
    if (kind === 'resume' || kind === 'summary') { const rec = loadGame(box.dataset.id); if (rec) { const g = sanitizeGame(rec.game); if (g) mountBoard(box, g, E.replay(g, (rec.events || []).filter(Sync.validEv)).S, { static: true }); } return; }
    if (G.game && G.R) mountBoard(box, G.game, G.R.S, { showJoin: kind === 'disp' && (G.showJoin || G.R.S.phase === 'pre') });
  });
}

/* ============================================================== status */
function statusInfo() {
  const st = G.status;
  if (!st) return { cls: '', text: 'Solo', title: 'This device only', long: 'Not linked yet' };
  const n = st.present.length;
  if (n) return { cls: 'live', text: n + ' linked', title: n + ' linked', long: n + ' other device' + (n > 1 ? 's' : '') + ' live: ' + st.present.map(p => p.name + (p.role ? ' (' + p.role + ')' : '')).join(', ') };
  if (st.ever && (st.queued > 0 || !st.online)) return { cls: 'warn', text: st.queued ? 'Offline · ' + st.queued : 'Offline', title: st.queued ? 'Offline · ' + st.queued + ' action' + (st.queued > 1 ? 's' : '') + ' queued' : 'Offline', long: 'Other devices are out of reach. Actions are saved here and sync when they reconnect.' };
  if (st.remote && st.remoteState === 'starting') return { cls: '', text: 'Linking', title: 'Linking', long: 'Connecting so other devices can join' };
  if (st.remote && st.remoteState === 'unavailable') return { cls: '', text: 'This browser', title: 'This browser only', long: IN_ARTIFACT ? 'Live linking needs you to be signed in. Other windows of this browser still stay in sync.' : 'Peer linking is unavailable here. Other windows of this browser still stay in sync.' };
  return { cls: '', text: 'Waiting', title: 'Waiting for devices', long: 'Ready. Other devices can join with code ' + (G.game ? G.game.code : '') };
}
function paintStatus() {
  const s = statusInfo();
  $$('[data-status]').forEach(el => { el.className = 'chip ' + s.cls; el.title = s.long; el.innerHTML = '<span class="dot"></span>' + esc(s.text); });
  const st = G.status;
  $$('[data-net]').forEach(el => {
    if (!st || (!st.ever && !st.present.length)) { el.hidden = true; return; }
    el.hidden = false; el.classList.toggle('off', !st.present.length);
  });
  if (ROUTE.v === 'join' && G.waitingJoin) { const el = $('#join-state'); if (el) el.innerHTML = joinStateHTML(); }
}

/* ============================================================== toasts */
function toast(msg, kind) {
  if (!msg || ROUTE.v === 'display') return;
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'alert' ? 5200 : 3200);
}

/* ============================================================== sheets */
let SHEET = null;
function openSheet(html, opts) {
  closeSheet();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
  scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  SHEET = { el: scrim, opts: opts || {} };
  const f = scrim.querySelector('[autofocus]') || scrim.querySelector('button, input, select');
  if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  return scrim.firstElementChild;
}
function refreshSheet() { if (SHEET && SHEET.opts.refresh) { try { SHEET.opts.refresh(); } catch (e) {} } }
function closeSheet() { if (SHEET) { const o = SHEET.opts; SHEET.el.remove(); SHEET = null; if (o.onClose) o.onClose(); } }
function sheetHead(title) { return '<div class="sheet-h"><h2>' + esc(title) + '</h2><button class="icon-btn" data-act="closeSheet" aria-label="Close">' + icon('x') + '</button></div>'; }

/* ================================================================ home */
function topBar(inner) { return '<header class="top"><div class="top-in gutter">' + inner + '</div></header>'; }
function wordmark() { return '<div class="wordmark"><span class="lampdot"></span><span>screen<b>RIG</b></span><span class="sep"></span><span class="prod">Scoreboard</span></div>'; }
function viewHome() {
  const idx = Store.get('games', []);
  const active = Store.get('active');
  const cur = active && idx.find(x => x.id === active.id && x.phase !== 'final') || idx.find(x => x.phase === 'live' || x.phase === 'break' || x.phase === 'pre');
  let resume = '';
  if (cur && loadGame(cur.id)) {
    const sp = E.SPORTS[cur.sport];
    resume = '<section class="resume"><div class="resume-head">' + sportIcon(cur.sport) + '<span class="grow">' + esc(cur.home.name) + ' vs ' + esc(cur.away.name) + '</span><span class="mono">' + esc(cur.code) + '</span></div>' +
      '<div class="resume-board stage" data-board="resume" data-id="' + esc(cur.id) + '"></div>' +
      '<div class="resume-foot"><button class="btn primary big" data-act="resume" data-id="' + esc(cur.id) + '" data-role="controller">' + icon('tablet') + ' Open controller</button>' +
      '<button class="btn big" data-act="resume" data-id="' + esc(cur.id) + '" data-role="display">' + icon('monitor') + ' Show display</button>' +
      '<span class="grow"></span><span class="muted small" style="align-self:center">' + esc(sp ? sp.name : '') + ' · ' + esc(cur.phase === 'pre' ? 'Pregame' : cur.phase === 'break' ? 'Between periods' : 'Live') + '</span></div></section>';
  }
  const install = deferredInstall ? '<button class="btn" data-act="install">' + icon('download') + ' Install app</button>' : '';
  return topBar(wordmark() + '<button class="chip" data-act="rename" title="Rename this device">' + icon('tablet') + esc(DEVICE.name) + '</button>') +
    '<main class="page gutter">' +
    '<div class="hello"><h2>Give your screens a scoreboard</h2><p>Pick a sport, choose two teams, and run the game from any phone or tablet. Displays and controllers join with a six-letter code.</p></div>' +
    resume +
    '<section class="actions">' +
    '<button class="action primary" data-act="nav" data-to="setup"><b>New game</b><span>Sport, teams and screen in under a minute</span></button>' +
    '<button class="action" data-act="nav" data-to="join"><b>Join a game</b><span>Enter a code as controller or display</span></button>' +
    '<button class="action" data-act="nav" data-to="teams"><b>Team library</b><span>' + TEAMS.length + ' teams with colours and logos</span></button>' +
    '<button class="action" data-act="nav" data-to="history"><b>Game history</b><span>' + idx.length + ' game' + (idx.length === 1 ? '' : 's') + ' on this device</span></button>' +
    '</section>' +
    '<div class="row"><button class="linkish" data-act="about">About this prototype</button>' + install + '</div>' +
    '</main>';
}

/* =============================================================== setup */
let DRAFT = null;
function newDraft() {
  const sport = E.SPORTS[PREFS.sport] ? PREFS.sport : 'basketball';
  const presets = PREFS.preset || {};
  const ids = TEAMS.map(t => t.id);
  const home = ids.indexOf(PREFS.home) >= 0 ? PREFS.home : ids[0];
  const away = ids.indexOf(PREFS.away) >= 0 && PREFS.away !== home ? PREFS.away : ids.find(i => i !== home);
  return {
    sport: sport, presetId: presets[sport] || E.SPORTS[sport].presets[0].id, ov: {},
    home: home, away: away, alt: { home: false, away: false },
    display: Object.assign({}, DISPLAY_DEFAULT, PREFS.display || {}),
    venue: PREFS.venue || '', start: '', pin: '',
  };
}
function draftTeam(side) {
  const t = teamById(DRAFT[side]) || { name: side === 'home' ? 'Home' : 'Away', short: side === 'home' ? 'HOME' : 'AWAY', c1: side === 'home' ? '#1d2a5b' : '#7a1f2b', c2: '#ffffff' };
  const o = { id: t.id, name: t.name, short: t.short, c1: t.c1, c2: t.c2, logo: t.logo || null };
  if (DRAFT.alt[side]) { o.c1 = t.c2; o.c2 = t.c1; }
  return o;
}
let draftGameCache = null;
function DRAFT_GAME() {
  const key = JSON.stringify([DRAFT.sport, DRAFT.presetId, DRAFT.ov, DRAFT.home, DRAFT.away, DRAFT.alt, DRAFT.display, DRAFT.venue, DRAFT.start]);
  if (draftGameCache && draftGameCache.key === key) return draftGameCache.g;
  const g = E.newGame({ sport: DRAFT.sport, presetId: DRAFT.presetId, overrides: DRAFT.ov, home: draftTeam('home'), away: draftTeam('away'), code: 'PREVIEW', now: 0 });
  g.display = Object.assign({}, DRAFT.display); g.venue = DRAFT.venue; g.start = DRAFT.start;
  draftGameCache = { key: key, g: g };
  return g;
}
/* Example state for previews, clearly not a real game. */
function sampleState(game) {
  const S = E.initState(game), R = game.rules, MIN = E.MIN;
  S.phase = 'live';
  const fix = (k, ms) => { if (S.clocks[k]) { S.clocks[k].ms = ms; S.clocks[k].run = false; } };
  switch (game.sport) {
    case 'basketball':
      S.period = Math.min(2, R.periods); S.score = { home: 42, away: 38 }; S.fouls = { home: 3, away: R.bonusAt }; S.arrow = 'away';
      fix('game', 4 * MIN + 12000); fix('shot', 14000); S.tol.home.full = Math.max(0, R.toFull - 1); break;
    case 'volleyball':
      S.period = 3; S.sets = { home: 1, away: 1 }; S.score = { home: 18, away: 16 }; S.serve = 'home';
      S.setScores = [{ home: 25, away: 21, w: 'home' }, { home: 22, away: 25, w: 'away' }]; S.to = { home: 1, away: 0 }; break;
    case 'soccer':
      S.period = 2; S.score = { home: 1, away: 1 }; S.yellows = { home: 1, away: 2 }; S.stats = { home: { shots: 9, corners: 4 }, away: { shots: 6, corners: 3 } };
      fix('game', R.clockDir === 'up' ? 22 * MIN + 24000 : 17 * MIN + 36000); break;
    case 'football':
      S.period = 3; S.score = { home: 14, away: 10 }; S.poss = 'home'; S.down = 3; S.dist = 6; S.ballOn = 34; S.ballSide = 'away'; S.tol = { home: 2, away: 3 };
      fix('game', 8 * MIN + 43000); break;
    case 'hockey':
      S.period = 2; S.score = { home: 2, away: 1 }; S.sog = { home: 18, away: 14 }; S.before = R.periodMin * MIN;
      fix('game', 11 * MIN + 5000);
      S.pen.away.push({ id: 'sample', n: '17', kind: 'minor', dur: 2 * MIN, start: S.before + (R.periodMin * MIN - (11 * MIN + 5000)) - 35000, rel: false }); break;
    case 'baseball':
      S.inning = 6; S.period = 6; S.half = 'top'; S.score = { home: 2, away: 4 };
      S.line = { away: [0, 1, 0, 2, 0, 1], home: [1, 0, 0, 0, 1] }; S.balls = 2; S.strikes = 1; S.outs = 1; S.bases = [1, 0, 1];
      S.hits = { home: 5, away: 7 }; S.errors = { home: 1, away: 0 }; S.pitcher.home = '21'; S.pc.home['21'] = 78; break;
  }
  return S;
}
function viewSetup() {
  if (!DRAFT) DRAFT = newDraft();
  const sp = E.SPORTS[DRAFT.sport];
  const R = E.resolveRules(DRAFT.sport, DRAFT.presetId, DRAFT.ov);
  const sports = E.SPORT_ORDER.map(id => '<button class="sport" aria-pressed="' + (DRAFT.sport === id) + '" data-act="dSport" data-id="' + id + '">' + sportIcon(id) + '<span>' + esc(E.SPORTS[id].name) + '</span></button>').join('');
  const presets = sp.presets.map(p => '<button class="preset" aria-pressed="' + (DRAFT.presetId === p.id) + '" data-act="dPreset" data-id="' + p.id + '"><span class="org">' + esc(p.org) + '</span>' + esc(p.name) + '</button>').join('');
  const fields = sp.fields.filter(f => !f.show || f.show(R)).map(f => fieldHTML(f, R[f.k])).join('');
  const nOv = Object.keys(DRAFT.ov).length;
  const teamBtn = side => {
    const t = draftTeam(side);
    return '<button class="team-pick" data-act="pickTeam" data-side="' + side + '"><span class="lab">' + (side === 'home' ? 'Home' : 'Away') + '</span><span class="badge">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : '') + '</span><span style="min-width:0"><b>' + esc(t.name) + '</b><span class="swatch"><i style="background:' + t.c1 + '"></i><i style="background:' + t.c2 + '"></i><span class="small muted mono" style="margin-left:4px">' + esc(t.short) + '</span></span></span></button>';
  };
  const d = DRAFT.display, dm = dims(d), cls = classify(dm.w, dm.h);
  const aspects = ASPECTS.map(a => {
    const w = a.id === 'custom' ? dm.w : a.w, h = a.id === 'custom' ? dm.h : a.h;
    const s = Math.min(64 / w, 36 / h);
    return '<button class="aspect" aria-pressed="' + (d.aspect === a.id) + '" data-act="dAspect" data-id="' + a.id + '"><span class="shape"><i style="width:' + Math.max(4, w * s).toFixed(0) + 'px;height:' + Math.max(3, h * s).toFixed(0) + 'px"></i></span><b>' + esc(a.label) + '</b><small>' + (a.id === 'custom' ? 'W × H px' : a.w + ' × ' + a.h) + '</small></button>';
  }).join('');
  const seg = (k, opts) => '<span class="seg">' + opts.map(o => '<button aria-pressed="' + (String(d[k]) === String(o[0])) + '" data-act="dDisp" data-k="' + k + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>').join('') + '</span>';
  const h = draftTeam('home'), a = draftTeam('away'), pr = sp.presets.find(p => p.id === DRAFT.presetId);
  return topBar('<button class="icon-btn" data-act="nav" data-to="home" aria-label="Back">' + icon('back') + '</button><h1>New game</h1>') +
    '<main class="page gutter"><div class="setup-grid"><div class="setup-col">' +
    '<section class="sec"><div class="sec-h"><span class="step">01</span><h2>Sport</h2></div><div class="sports">' + sports + '</div></section>' +
    '<section class="sec"><div class="sec-h"><span class="step">02</span><h2>Rules</h2><span class="aside">Version ' + esc(E.RULES_VERSION) + '</span></div><div class="presets">' + presets + '</div>' +
    '<details class="adjust"' + (nOv ? ' open' : '') + '><summary>' + icon('chev') + 'Adjust for this game' + (nOv ? ' <span class="tag note">' + nOv + ' changed</span>' : '') + '</summary><div class="fields">' + fields + '</div>' +
    (nOv ? '<div class="row" style="margin-top:10px"><button class="btn" data-act="dResetOv">Back to ' + esc(pr.org) + ' defaults</button></div>' : '') + '</details>' +
    '<p class="note">Defaults reflect common configurations. Check them against your league before a real game.</p></section>' +
    '<section class="sec"><div class="sec-h"><span class="step">03</span><h2>Teams</h2><button class="btn ghost small" style="margin-left:auto" data-act="nav" data-to="teams">Manage library</button></div>' +
    '<div class="matchup-pick">' + teamBtn('home') + '<button class="icon-btn swap" data-act="dSwap" aria-label="Swap home and away">' + icon('swap') + '</button>' + teamBtn('away') + '</div>' +
    '<div class="opt-row"><span>Alternate colours</span><span class="seg"><button aria-pressed="' + DRAFT.alt.home + '" data-act="dAlt" data-side="home">' + esc(h.short) + '</button><button aria-pressed="' + DRAFT.alt.away + '" data-act="dAlt" data-side="away">' + esc(a.short) + '</button></span></div>' +
    (contrast(h.c1, a.c1) < 1.5 ? '<p class="note" style="color:var(--warn)">Both teams use similar colours. Try alternate colours for one side.</p>' : '') +
    '</section>' +
    '</div><div class="setup-col">' +
    '<section class="sec"><div class="sec-h"><span class="step">04</span><h2>Screen</h2><span class="aside">' + esc(CLASS_NAME[cls]) + ' layout</span></div>' +
    '<div class="preview stage" data-board="setup" id="setup-preview"></div>' +
    '<div class="preview-cap"><span>Example game state</span><span class="mono">' + dm.w + ' × ' + dm.h + ' px</span></div>' +
    '<div class="aspects">' + aspects + '</div>' +
    (d.aspect === 'custom' ? '<div class="fields"><label class="field"><span>Width</span><div class="unit"><input class="input" id="d-w" inputmode="numeric" value="' + dm.w + '"><em>px</em></div></label><label class="field"><span>Height</span><div class="unit"><input class="input" id="d-h" inputmode="numeric" value="' + dm.h + '"><em>px</em></div></label></div>' : '') +
    '<label class="field"><span>Safe area margin: <b id="safe-v">' + d.safe + '%</b></span><input type="range" id="d-safe" min="0" max="12" value="' + d.safe + '"><small>Keeps content clear of bezels, LED cabinet edges and overscan</small></label>' +
    '<div class="opt-row"><span>Digits</span>' + seg('style', [['modern', 'Modern'], ['led', 'LED segments']]) + '</div>' +
    '<div class="opt-row"><span>Board</span>' + seg('mode', [['dark', 'Dark'], ['light', 'Light']]) + seg('bg', [['gradient', 'Team glow'], ['solid', 'Solid']]) + '</div>' +
    '<div class="opt-row"><span>Typeface</span><select class="select" id="d-font" style="max-width:220px">' + FONTS.map(f => '<option value="' + f[0] + '"' + (d.font === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>').join('') + '</select></div>' +
    '<div class="toggle"><span>Score and period animations</span><button class="switch" role="switch" aria-checked="' + (d.anim !== false) + '" data-act="dAnim" aria-label="Animations"></button></div>' +
    '<p class="note">Viewing distance: ' + esc(viewingDistance(dm.w, dm.h, cls)) + '. Score and clock keep at least 7:1 contrast.</p>' +
    '</section>' +
    '<section class="sec"><div class="sec-h"><span class="step">05</span><h2>Game details</h2><span class="aside">Optional</span></div><div class="fields">' +
    '<label class="field"><span>Venue or court</span><input class="input" id="d-venue" value="' + esc(DRAFT.venue) + '" maxlength="60" placeholder="Main gym"></label>' +
    '<label class="field"><span>Start time</span><input class="input" id="d-start" type="time" value="' + esc(DRAFT.start) + '"></label>' +
    '<label class="field"><span>Scorekeeper PIN</span><input class="input" id="d-pin" inputmode="numeric" maxlength="6" value="' + esc(DRAFT.pin) + '" placeholder="None"><small>Asked when a controller joins from another device</small></label>' +
    '</div></section>' +
    '</div></div></main>' +
    '<div class="create-bar gutter"><div class="in"><div class="sum"><b>' + esc(h.name) + '</b> vs <b>' + esc(a.name) + '</b><br>' + esc(sp.name) + ' · ' + esc(pr.org + ' ' + pr.name) + ' · ' + esc(d.aspect === 'custom' ? dm.w + '×' + dm.h : d.aspect) + '</div><button class="btn primary big" data-act="create">' + icon('check') + ' Create game</button></div></div>';
}
function fieldHTML(f, v) {
  const id = 'ov-' + f.k;
  if (f.type === 'bool') return '<div class="field toggle"><span>' + esc(f.label) + '</span><button class="switch" role="switch" id="' + id + '" aria-checked="' + !!v + '" data-act="dOvBool" data-k="' + f.k + '" aria-label="' + esc(f.label) + '"></button></div>';
  if (f.type === 'select') return '<label class="field"><span>' + esc(f.label) + '</span><select class="select" id="' + id + '" data-ov="' + f.k + '">' + f.options.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
  return '<label class="field"><span>' + esc(f.label) + '</span><div class="unit"><input class="input" id="' + id + '" data-ov="' + f.k + '" type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" value="' + esc(v) + '">' + (f.unit ? '<em>' + esc(f.unit) + '</em>' : '') + '</div>' + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
}
function refreshPreview() {
  const box = $('#setup-preview');
  if (box) mountBoard(box, DRAFT_GAME(), sampleState(DRAFT_GAME()), { static: true });
}
function createGame() {
  const h = draftTeam('home'), a = draftTeam('away');
  if (DRAFT.home === DRAFT.away) return toast('Pick two different teams.', 'alert');
  const game = E.newGame({
    sport: DRAFT.sport, presetId: DRAFT.presetId, overrides: DRAFT.ov, home: h, away: a, timebase: DEVICE.id,
    display: Object.assign({}, DRAFT.display), venue: DRAFT.venue.trim(), start: DRAFT.start, pin: DRAFT.pin.replace(/\D/g, '').slice(0, 6),
  });
  PREFS.sport = DRAFT.sport; PREFS.preset = Object.assign({}, PREFS.preset || {}, { [DRAFT.sport]: DRAFT.presetId });
  PREFS.home = DRAFT.home; PREFS.away = DRAFT.away; PREFS.display = Object.assign({}, DRAFT.display); PREFS.venue = DRAFT.venue.trim();
  savePrefs();
  closeGame(true);
  G.game = sanitizeGame(game); G.game.id = game.id; G.events = []; G.role = 'controller'; G.offset = 0;
  recompute(); persist(); startLink();
  Store.set('active', { id: G.game.id, role: null });
  DRAFT = null;
  go('invite');
}

/* ============================================================== invite */
function inviteBlock(compact) {
  const g = G.game, url = joinUrl(g.code, 'controller'), qr = url ? qrSVG(url) : '';
  const how = IN_ARTIFACT
    ? 'On the other device, open this same page while signed in to Claude, choose Join a game and enter the code.' + (url ? ' Or scan the code.' : '')
    : 'Scan with the iPad, or open the link and enter the code. Devices on the same network link directly.';
  return '<div class="invite">' + (qr ? '<div class="qr">' + qr + '</div>' : '') +
    '<div class="stack" style="min-width:0"><div><div class="small muted">Game code</div><div class="code">' + groupCode(g.code) + '</div></div>' +
    (url ? '<div class="link-box"><code>' + esc(url) + '</code><button class="btn" data-act="copy" data-text="' + esc(url) + '">' + icon('copy') + ' Copy</button></div>' : '') +
    '<p class="note">' + esc(how) + (g.pin ? ' Controllers will be asked for the PIN.' : '') + '</p>' +
    (compact ? '' : '<p class="note">For a screenRIG Player, point it at the display link: <span class="mono">' + esc(joinUrl(g.code, 'display') || '#display-' + g.code) + '</span></p>') +
    '</div></div>';
}
function viewInvite() {
  if (!G.game) return viewHome();
  const g = G.game, sp = E.SPORTS[g.sport];
  return topBar('<button class="icon-btn" data-act="nav" data-to="home" aria-label="Home">' + icon('back') + '</button><h1>Game ready</h1><span data-status class="chip"></span>') +
    '<main class="page narrow gutter">' +
    '<section class="sec"><div class="sec-h"><h2>' + esc(g.teams.home.name) + ' vs ' + esc(g.teams.away.name) + '</h2></div><p class="muted" style="margin:0">' + esc(sp.name) + ' · ' + esc(sp.presets.find(p => p.id === g.presetId).org) + ' rules · ' + esc(g.display.aspect === 'custom' ? g.display.w + '×' + g.display.h : g.display.aspect) + ' screen</p>' + inviteBlock(false) + '</section>' +
    '<section class="stack"><div class="sec-h"><h2>Use this device as</h2></div><div class="roles">' +
    '<button class="role" data-act="useRole" data-role="controller">' + icon('tablet', 'lg') + '<b>Controller</b><span>Score, clock, fouls and timeouts with undo. Best on an iPad.</span></button>' +
    '<button class="role" data-act="useRole" data-role="display">' + icon('monitor', 'lg') + '<b>Display</b><span>The full-screen board for the TV, player or projector.</span></button>' +
    '<button class="role" data-act="useRole" data-role="both">' + icon('eye', 'lg') + '<b>Both</b><span>Controller here with a live board preview. Good for trying it out.</span></button>' +
    '</div></section></main>';
}

/* ================================================================ join */
function viewJoin() {
  const w = G.waitingJoin;
  const code = (ROUTE.code || (w && w.code) || '').toUpperCase();
  const role = ROUTE.role || (w && w.role) || 'controller';
  const roles = [['controller', 'Controller', 'Run the game'], ['display', 'Display', 'Show the board'], ['clock', 'Clock only', 'Split duties at the table'], ['viewer', 'Viewer', 'Read-only, for coaches']];
  return topBar('<button class="icon-btn" data-act="cancelJoin" aria-label="Back">' + icon('back') + '</button><h1>Join a game</h1>') +
    '<main class="page narrow gutter">' +
    '<section class="sec"><label class="field"><span>Game code</span><input class="input codein" id="join-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2XM" value="' + esc(code) + '"' + (w ? ' disabled' : '') + '></label>' +
    '<div class="field"><span>Join as</span><div class="seg" role="group">' + roles.map(r => '<button aria-pressed="' + (role === r[0]) + '" data-act="joinRole" data-role="' + r[0] + '"' + (w ? ' disabled' : '') + '>' + esc(r[1]) + '</button>').join('') + '</div><small>' + esc((roles.find(r => r[0] === role) || roles[0])[2]) + '</small></div>' +
    (w ? '<div id="join-state" class="stack">' + joinStateHTML() + '</div>' : '<button class="btn primary big block" data-act="doJoin">' + icon('link') + ' Connect</button>') +
    '</section>' +
    '<p class="note">' + (IN_ARTIFACT ? 'Both devices need to have this page open and be signed in to Claude. On one device, two windows link instantly.' : 'Devices find each other through a public WebRTC broker, then talk directly. Works best when both are on the same Wi-Fi.') + '</p>' +
    '</main>';
}
function joinStateHTML() {
  const w = G.waitingJoin; if (!w) return '';
  const secs = Math.round((Date.now() - w.t0) / 1000);
  if (G.game) return '<div class="banner"><div class="msg"><b>Found ' + esc(G.game.teams.home.short) + ' vs ' + esc(G.game.teams.away.short) + '</b><span>Loading the game log…</span></div></div>';
  const st = statusInfo();
  return '<div class="banner"><div class="msg"><b>Looking for ' + esc(w.code) + '…</b><span>' + esc(st.long) + '</span></div><button class="btn" data-act="cancelJoin">Cancel</button></div>' +
    (secs > 12 ? '<p class="note">Still nothing. Make sure the game is open on its display or controller' + (IN_ARTIFACT ? ' and that both devices are signed in.' : ', and that both devices are online.') + '</p>' : '');
}
function startJoin(code, role) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length !== 6) return toast('Game codes have six letters and numbers.', 'alert');
  const local = Store.get('games', []).find(x => x.code === code);
  if (local && loadGame(local.id)) return openGame(local.id, role === 'display' ? 'display' : role, role === 'display' ? 'display' : 'control');
  closeGame(true);
  G.role = role; G.waitingJoin = { code: code, role: role, t0: Date.now() };
  G.pending = [];
  startLink();
  ROUTE = { v: 'join', code: code, role: role };
  render(true);
  const w = G.waitingJoin;
  const iv = setInterval(() => { if (G.waitingJoin !== w) return clearInterval(iv); paintStatus(); }, 1000);
}
function finishJoin() {
  const w = G.waitingJoin; if (!w || !G.game) return;
  if (G.game.pin && (w.role === 'controller' || w.role === 'clock') && !w.pinOk) return askPin(w);
  G.waitingJoin = null;
  G.role = w.role === 'display' ? 'display' : w.role;
  if (G.link) G.link.o.role = G.role;
  go(w.role === 'display' ? 'display' : 'control');
}
function askPin(w) {
  const el = openSheet(sheetHead('Scorekeeper PIN') + '<p class="muted" style="margin:0">This game asks controllers for a PIN.</p><input class="input codein" id="pin-in" inputmode="numeric" maxlength="6" autocomplete="off" autofocus><div class="row end"><button class="btn" data-act="viewerInstead">Join as viewer</button><button class="btn primary" data-act="pinOk">Continue</button></div>');
  el.querySelector('#pin-in').addEventListener('keydown', e => { if (e.key === 'Enter') ACT.pinOk(); });
}

/* ========================================================== controller */
function teamOf(side) { return G.game.teams[side]; }
function tStyle(side) { const t = teamOf(side); return '--tc:' + t.c1 + ';--tf:' + textOn(t.c1); }
function evBtn(t, p, label, cls, extra) { return '<button class="tb ' + (cls || '') + '" data-act="ev" data-t="' + t + '" data-p="' + attr(p || {}) + '"' + (extra || '') + '>' + label + '</button>'; }
function viewControl() {
  const g = G.game, S = G.R.S, sp = E.SPORTS[g.sport];
  const pr = sp.presets.find(p => p.id === g.presetId) || sp.presets[0];
  const role = G.role === 'display' ? 'controller' : G.role;
  const top = topBar('<button class="icon-btn" data-act="leave" aria-label="Home">' + icon('home') + '</button>' +
    '<div class="ctl-title"><b>' + esc(g.teams.home.short) + ' vs ' + esc(g.teams.away.short) + '</b><span>' + esc(sp.name.split(' /')[0]) + ' · ' + esc(pr.org) + ' · <span class="mono">' + esc(g.code) + '</span></span></div>' +
    '<span data-status class="chip"></span>' +
    '<button class="icon-btn" data-act="togglePreview" aria-pressed="' + !!G.preview + '" aria-label="Board preview" title="Board preview">' + icon('eye') + '</button>' +
    '<button class="icon-btn hide-sm" data-act="openDisplay" aria-label="Show display on this device" title="Show display here">' + icon('monitor') + '</button>');
  let body = banners();
  if (G.preview || role === 'viewer') body += '<div class="preview-pane stage" data-board="ctl"></div>';
  if (role === 'viewer') body += viewerPanel();
  else {
    body += scoreline(role);
    if (role === 'controller') body += S.so ? shootoutPad() : (g.sport === 'baseball' ? baseballPad() : pads());
  }
  const dock = role === 'viewer' ? '' : dockHTML();
  return '<div class="ctl">' + top + '<main class="ctl-body gutter">' + body + '</main>' + dock + '</div>';
}
function banners() {
  const g = G.game, S = G.R.S, sp = E.SPORTS[g.sport], R = g.rules, out = [];
  const st = statusInfo();
  if (st.cls === 'warn') out.push('<div class="banner warn"><div class="msg"><b>' + esc(st.title) + '</b><span>' + esc(st.long) + '</span></div></div>');
  if (G.role === 'viewer') return out.join('');
  if (S.phase === 'pre') {
    out.push('<div class="banner"><div class="msg"><b>Pregame</b><span>The display shows the matchup and the join code. Starting the clock also starts the game.</span></div><button class="btn primary big" data-act="step" data-id="start">' + icon('play') + ' Start game</button></div>');
  } else if (S.phase === 'live' && S.clocks.game && E.clockValue(S, 'game', now()) <= 0 && !S.so) {
    out.push('<div class="banner time"><div class="msg"><b>Time · end of ' + esc(sp.label(S, R).long) + '</b><span>Free throws or corrections still count before you confirm.</span></div><button class="btn go big" data-act="step" data-id="end">End ' + esc(sp.label(S, R).short) + '</button></div>');
  } else if (S.phase === 'live' && g.sport === 'soccer' && S.clocks.game && S.clocks.game.dir === 'up' && E.clockValue(S, 'game', now()) >= sp.periodMs(S, R)) {
    out.push('<div class="banner time"><div class="msg"><b>Added time</b><span>End the ' + esc(sp.label(S, R).long) + ' when the referee does.</span></div><button class="btn go big" data-act="step" data-id="end">End ' + esc(sp.label(S, R).short) + '</button></div>');
  } else if (S.phase === 'break') {
    const steps = E.nextSteps(g, S);
    const title = E.breakTitle(g, S);
    const sub = S.decided ? E.SPORTS[g.sport].name.split(' /')[0] + ': ' + g.teams[S.decided].name + ' leads. Confirm to show the final screen.' : (S.tie ? 'Choose how to break the tie.' : 'The display shows the break screen' + (S.clocks.brk ? ' with a countdown.' : '.'));
    out.push('<div class="banner time"><div class="msg"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>' + steps.map((s, i) => '<button class="btn ' + (i === 0 ? 'go big' : 'big') + '" data-act="step" data-id="' + s.id + '">' + esc(s.label) + '</button>').join('') + '</div>');
  } else if (S.phase === 'final') {
    const w = S.winner;
    out.push('<div class="banner"><div class="msg"><b>Final' + (w ? ' · ' + esc(g.teams[w].name) + ' wins' : ' · tie') + '</b><span>' + esc(g.teams.home.short) + ' ' + S.score.home + ', ' + esc(g.teams.away.short) + ' ' + S.score.away + '. Hold Reopen to make corrections.</span></div>' +
      '<button class="btn" data-act="summaryCur">Summary</button><button class="btn" data-hold="900" data-act="step" data-id="reopen">Hold to reopen</button><button class="btn primary" data-act="nav" data-to="setup">New game</button></div>');
  }
  if (S.phase === 'live' && S.switchNow) out.push('<div class="banner alert"><div class="msg"><b>Switch sides</b><span>The deciding set reached ' + esc(R.sideSwitchAt) + ' points.</span></div></div>');
  if (g.sport === 'basketball' && S.phase === 'live') {
    const out2 = ['home', 'away'].filter(s => S.out[s].length).map(s => g.teams[s].short + ' ' + S.out[s].map(n => '#' + n).join(', '));
    if (out2.length) out.push('<div class="banner"><div class="msg"><b>Fouled out</b><span>' + esc(out2.join(' · ')) + '</span></div></div>');
  }
  return out.join('');
}
function teamSub(side) {
  const g = G.game, S = G.R.S, R = g.rules, chips = [];
  const o = E.opp(side);
  switch (g.sport) {
    case 'basketball': {
      chips.push('Fouls ' + S.fouls[side]);
      chips.push('TO ' + S.tol[side].full + (R.toShort || S.tol[side].short ? ' + ' + S.tol[side].short : ''));
      const b = E.SPORTS.basketball.bonus(S, R, side);
      if (b) chips.push(b === 2 ? 'Double bonus' : 'Bonus');
      break;
    }
    case 'volleyball': chips.push('Sets ' + S.sets[side]); chips.push('TO ' + (R.toPerSet - S.to[side]) + ' left'); if (S.serve === side) chips.push('Serving'); break;
    case 'soccer': chips.push(S.yellows[side] + ' yellow'); if (S.reds[side]) chips.push(S.reds[side] + ' red'); if (R.showStats) chips.push(S.stats[side].shots + ' shots'); break;
    case 'football': chips.push('TO ' + S.tol[side]); if (S.poss === side) chips.push('Ball'); break;
    case 'hockey': {
      chips.push(S.sog[side] + ' SOG');
      const st = E.SPORTS.hockey.strength(S, R, now());
      if (S.phase === 'live' && st[side] > st[o]) chips.push('Power play');
      if (S.empty[side]) chips.push('Empty net');
      break;
    }
    case 'baseball': chips.push('H ' + S.hits[side] + ' · E ' + S.errors[side]); if (E.SPORTS.baseball.bat(S) === side) chips.push('Batting'); break;
  }
  return chips.map(c => '<em>' + esc(c) + '</em>').join('');
}
function scoreline(role) {
  const g = G.game, S = G.R.S;
  const tile = side => {
    const t = teamOf(side);
    return '<div class="sl-team ' + side + '" style="' + tStyle(side) + '"><div class="nm">' + (t.logo ? '<img class="mini" src="' + esc(t.logo) + '" alt="">' : '') + '<span class="full">' + esc(t.name) + '</span><span class="abbr">' + esc(t.short) + '</span></div>' +
      '<div class="sc">' + S.score[side] + '</div><div class="sub">' + teamSub(side) + '</div></div>';
  };
  return '<section class="scoreline">' + tile('home') + consoleHTML(role) + tile('away') + '</section>';
}
function consoleHTML(role) {
  const g = G.game, S = G.R.S, sp = E.SPORTS[g.sport], R = g.rules;
  const lab = sp.label(S, R);
  const phaseTxt = { pre: 'Pregame', live: 'Live', break: 'Break', final: 'Final' }[S.phase];
  let h = '<div class="console"><div class="per"><span>' + esc(phaseTxt) + '</span><b>' + esc(lab.short) + '</b><span>' + esc(S.so ? 'Shootout' : (g.sport === 'volleyball' ? S.sets.home + '–' + S.sets.away + ' sets' : '')) + '</span></div>';
  const gc = S.clocks.game;
  if (gc && !S.so) {
    const up = gc.dir === 'up';
    const off = g.sport === 'soccer' && up ? sp.offsetMs(R, S.period) : 0;
    const spec = { tenths: !up, offset: off };
    h += '<button class="clk' + (gc.run ? '' : ' idle') + '" data-act="clock" data-k="game" data-live="game" data-spec="' + attr(spec) + '" data-zero aria-label="Game clock, tap to ' + (gc.run ? 'stop' : 'start') + '">' + esc(E.liveText(g, S, 'game', now(), spec)) + '</button>';
    const can = S.phase === 'live' || S.phase === 'pre';
    h += '<button class="clk-go ' + (gc.run ? 'stop' : 'start') + '" data-act="clock" data-k="game"' + (can ? '' : ' disabled') + '>' + (gc.run ? icon('pause') + 'Stop' : icon('play') + 'Start') + '</button>';
    h += '<div class="adj"><button class="cbtn" data-act="adj" data-d="-10000">−10</button><button class="cbtn" data-act="adj" data-d="-1000">−1</button><button class="cbtn" data-act="clockset" data-k="game">Set</button><button class="cbtn" data-act="adj" data-d="1000">+1</button><button class="cbtn" data-act="adj" data-d="10000">+10</button></div>';
  } else if (g.sport === 'baseball') {
    h += '<div class="clk idle" style="font-size:56px">' + esc(S.balls + '-' + S.strikes) + '</div><div class="per"><span>Count</span><b>' + S.outs + ' out' + (S.outs === 1 ? '' : 's') + '</b><span>' + esc(teamOf(E.SPORTS.baseball.bat(S)).short) + ' up</span></div>';
  } else if (g.sport === 'volleyball') {
    h += '<div class="clk idle" style="font-size:64px">' + S.score.home + '–' + S.score.away + '</div><div class="per"><span>Serve</span><b>' + esc(teamOf(S.serve).short) + '</b><span>Set to ' + (S.period === R.bestOf ? R.decidingTo : R.setTo) + '</span></div>';
  } else if (S.so) {
    h += '<div class="clk idle" style="font-size:64px">' + S.so.k.home.filter(Boolean).length + '–' + S.so.k.away.filter(Boolean).length + '</div>';
  } else if (!gc) {
    h += '<div class="clk idle" style="font-size:44px">No clock</div><div class="per"><span>' + esc(lab.long) + '</span></div>';
  }
  Object.keys(S.clocks).forEach(k => {
    if (k === 'game' || k === 'brk') return;
    const c = S.clocks[k], name = { shot: 'Shot', play: 'Play', pitch: 'Pitch' }[k] || k;
    let btns = '';
    if (k === 'shot') btns = '<button class="cbtn" data-act="clockQuick" data-k="shot" data-ms="' + R.shotFull * 1000 + '">' + R.shotFull + '</button>' + (R.shotShort ? '<button class="cbtn" data-act="clockQuick" data-k="shot" data-ms="' + R.shotShort * 1000 + '">' + R.shotShort + '</button>' : '<button class="cbtn" data-act="clockset" data-k="shot">Set</button>') + '<button class="cbtn" data-act="clock" data-k="shot">' + (c.run ? 'Stop' : 'Start') + '</button>';
    else if (k === 'play') btns = '<button class="cbtn" data-act="clockQuick" data-k="play" data-ms="' + R.playLong * 1000 + '" data-run="1">' + R.playLong + '</button><button class="cbtn" data-act="clockQuick" data-k="play" data-ms="' + R.playShort * 1000 + '" data-run="1">' + R.playShort + '</button><button class="cbtn" data-act="clock" data-k="play">' + (c.run ? 'Stop' : 'Start') + '</button>';
    else if (k === 'pitch') btns = '<button class="cbtn" data-act="clockQuick" data-k="pitch" data-ms="' + R.pitchClock * 1000 + '" data-run="1">Reset ' + R.pitchClock + '</button><button class="cbtn" data-act="clock" data-k="pitch">' + (c.run ? 'Stop' : 'Start') + '</button><button class="cbtn" data-act="clockset" data-k="pitch">Set</button>';
    h += '<div class="subclk"><div><div class="lbl">' + esc(name) + '</div><div class="v' + (c.run ? '' : ' idle') + '" data-live="' + k + '" data-spec="' + attr({ secs: true, tenthsUnder: k === 'shot' ? 5000 : 0 }) + '">' + esc(E.liveText(g, S, k, now(), { secs: true })) + '</div></div><div class="btns">' + btns + '</div></div>';
  });
  if (S.clocks.brk) h += '<div class="subclk"><div><div class="lbl">Break</div><div class="v" data-live="brk" data-spec="{}"></div></div><div class="btns"><button class="cbtn" data-act="clock" data-k="brk">' + (S.clocks.brk.run ? 'Pause' : 'Run') + '</button><button class="cbtn" data-act="clockset" data-k="brk">Set</button><button class="cbtn" data-act="clockQuick" data-k="brk" data-ms="0">Clear</button></div></div>';
  return h + '</div>';
}
function pads() {
  const g = G.game, S = G.R.S, R = g.rules;
  const pad = side => {
    const t = teamOf(side);
    return '<section class="pad" style="' + tStyle(side) + '"><h3><i></i><span class="ttl">' + esc(t.name) + '</span></h3>' + teamButtons(side) + '</section>';
  };
  return '<section class="pads">' + pad('home') + '<section class="pad mid">' + midPad() + '</section>' + pad('away') + '</section>';
}
function teamButtons(side) {
  const g = G.game, S = G.R.S, R = g.rules, P = s => Object.assign({ side: side }, s || {});
  switch (g.sport) {
    case 'basketball': {
      const tol = S.tol[side];
      return evBtn('score', P({ pts: 2 }), '+2', 'xl') + '<div class="g2">' + evBtn('score', P({ pts: 3 }), '+3') + evBtn('score', P({ pts: 1 }), '+1') + '</div>' +
        '<button class="tb alt" data-act="keypad" data-mode="foul" data-side="' + side + '">Foul<small>' + S.fouls[side] + ' team fouls</small></button>' +
        '<div class="g2">' + evBtn('timeout', P({ kind: 'full' }), 'Timeout<small>' + tol.full + ' left</small>', 'alt', tol.full ? '' : ' disabled') +
        (R.toShort || tol.short ? evBtn('timeout', P({ kind: 'short' }), '30 sec<small>' + tol.short + ' left</small>', 'alt', tol.short ? '' : ' disabled') : evBtn('score', P({ pts: -1 }), '−1 point', 'alt')) + '</div>' +
        (R.toShort || tol.short ? evBtn('score', P({ pts: -1 }), '−1 point', 'sm') : '');
    }
    case 'volleyball': {
      const left = R.toPerSet - S.to[side];
      return evBtn('score', P(), 'Point', 'xl') +
        '<div class="g2">' + evBtn('timeout', P(), 'Timeout<small>' + left + ' left</small>', 'alt', left > 0 ? '' : ' disabled') + evBtn('sub', P(), 'Sub<small>' + S.subs[side] + (R.subsPerSet ? ' of ' + R.subsPerSet : '') + '</small>', 'alt') + '</div>' +
        '<div class="g2"><button class="tb alt" data-act="keypad" data-mode="vcard" data-side="' + side + '">Card</button>' + evBtn('serve', P(), S.serve === side ? 'Serving' : 'Serve', 'alt' + (S.serve === side ? ' on' : '')) + '</div>';
    }
    case 'soccer':
      return evBtn('score', P({ pts: 1 }), 'Goal', 'xl') +
        '<div class="g2"><button class="tb yellow" data-act="keypad" data-mode="card" data-color="Y" data-side="' + side + '">Yellow</button><button class="tb red" data-act="keypad" data-mode="card" data-color="R" data-side="' + side + '">Red</button></div>' +
        (R.showStats ? '<div class="g2">' + evBtn('stat', P({ k: 'shots', d: 1 }), 'Shot<small>' + S.stats[side].shots + '</small>', 'alt') + evBtn('stat', P({ k: 'corners', d: 1 }), 'Corner<small>' + S.stats[side].corners + '</small>', 'alt') + '</div>' : '') +
        (R.toPerHalf ? evBtn('timeout', P(), 'Timeout<small>' + S.tol[side] + ' left</small>', 'alt', S.tol[side] > 0 ? '' : ' disabled') : '') +
        evBtn('score', P({ pts: -1 }), 'Remove goal', 'sm');
    case 'football':
      return evBtn('score', P({ kind: 'td' }), 'TD<small>+6</small>', 'xl') +
        '<div class="g3">' + evBtn('score', P({ kind: 'pat' }), 'PAT<small>+1</small>') + evBtn('score', P({ kind: 'two' }), '2PT<small>+2</small>') + evBtn('score', P({ kind: 'fg' }), 'FG<small>+3</small>') + '</div>' +
        '<div class="g2">' + evBtn('score', P({ kind: 'safety' }), 'Safety<small>+2</small>', 'alt') + evBtn('score', P({ kind: 'd2' }), 'Def. 2PT<small>+2</small>', 'alt') + '</div>' +
        '<div class="g2">' + evBtn('timeout', P(), 'Timeout<small>' + S.tol[side] + ' left</small>', 'alt', S.tol[side] > 0 ? '' : ' disabled') + evBtn('poss', P(), S.poss === side ? 'Has ball' : 'Give ball', 'alt' + (S.poss === side ? ' on' : '')) + '</div>' +
        evBtn('score', P({ pts: -1 }), '−1 point', 'sm');
    case 'hockey':
      return evBtn('score', P({ pts: 1 }), 'Goal', 'xl') +
        '<div class="g2">' + evBtn('stat', P({ k: 'sog', d: 1 }), 'Shot<small>' + S.sog[side] + ' on goal</small>', 'alt') + '<button class="tb alt" data-act="keypad" data-mode="penalty" data-side="' + side + '">Penalty</button></div>' +
        '<div class="g2">' + evBtn('timeout', P(), 'Timeout<small>' + S.tol[side] + ' left</small>', 'alt', S.tol[side] > 0 ? '' : ' disabled') + evBtn('empty', P({ on: !S.empty[side] }), S.empty[side] ? 'Goalie back' : 'Empty net', 'alt' + (S.empty[side] ? ' on' : '')) + '</div>' +
        '<div class="g2">' + evBtn('score', P({ pts: -1 }), 'Remove goal', 'sm') + evBtn('stat', P({ k: 'sog', d: -1 }), '−1 shot', 'sm') + '</div>';
  }
  return '';
}
function midPad() {
  const g = G.game, S = G.R.S, R = g.rules, T = s => esc(teamOf(s).short);
  switch (g.sport) {
    case 'basketball':
      return '<h3>Possession arrow</h3><div class="arrow-pick">' + evBtn('arrow', { side: 'home' }, '◀ ' + T('home'), 'alt' + (S.arrow === 'home' ? ' on' : '')) + evBtn('arrow', { side: 'away' }, T('away') + ' ▶', 'alt' + (S.arrow === 'away' ? ' on' : '')) + '</div>' +
        '<div class="mid-lab">Bonus</div><div class="small muted">' + ['home', 'away'].map(s => { const b = E.SPORTS.basketball.bonus(S, R, s); return T(s) + ': ' + (b === 2 ? 'double bonus' : b ? 'in the bonus' : 'not yet'); }).join('<br>') + '</div>' +
        '<div class="mid-lab">Rules</div><div class="small muted">Bonus on foul ' + R.bonusAt + (R.doubleAt ? ', double on ' + R.doubleAt : '') + ' · foul out at ' + R.foulOut + ' · fouls reset each ' + (R.foulWindow === 'half' ? 'half' : 'period') + '</div>' + periodControls();
    case 'volleyball':
      return '<h3>Set ' + S.period + ' of up to ' + R.bestOf + '</h3><div class="small muted">To ' + (S.period === R.bestOf ? R.decidingTo : R.setTo) + ', win by ' + R.winBy + (R.cap ? ', cap ' + R.cap : '') + '. Sets end automatically.</div>' +
        (S.setScores.length ? '<div class="mid-lab">Sets</div><div class="small">' + S.setScores.map((x, i) => 'Set ' + (i + 1) + ': ' + x.home + '–' + x.away).join('<br>') + '</div>' : '') +
        (S.clocks.game ? '<div class="mid-lab">Match timer</div><button class="tb alt" data-act="clock" data-k="game">' + (S.clocks.game.run ? 'Pause timer' : 'Run timer') + '</button>' : '');
    case 'soccer':
      return '<h3>Added time</h3><div class="stepper"><button class="icon-btn" data-act="ev" data-t="stoppage" data-p="' + attr({ min: Math.max(0, S.stoppage - 1) }) + '" aria-label="Less">−</button><b>+' + S.stoppage + '</b><button class="icon-btn" data-act="ev" data-t="stoppage" data-p="' + attr({ min: S.stoppage + 1 }) + '" aria-label="More">+</button></div>' +
        '<div class="small muted">Shown on the board next to the clock.</div>' + periodControls();
    case 'football': {
      const downs = [1, 2, 3, 4].map(d => evBtn('down', { down: d }, E.ord(d), 'alt' + (S.down === d ? ' on' : ''))).join('');
      return '<h3>Down and distance</h3><div class="downs">' + downs + '</div>' +
        '<div class="stepper"><button class="icon-btn" data-act="ev" data-t="down" data-p="' + attr({ down: S.down, dist: Math.max(1, S.dist - 1) }) + '" aria-label="Shorter">−</button><b>' + (S.goal ? 'Goal' : S.dist) + '</b><button class="icon-btn" data-act="ev" data-t="down" data-p="' + attr({ down: S.down, dist: S.dist + 1 }) + '" aria-label="Longer">+</button></div>' +
        '<div class="g2">' + evBtn('down', { down: 1, dist: 10 }, '1st & 10', 'alt') + evBtn('down', { down: S.down, goal: !S.goal }, S.goal ? '& distance' : '& goal', 'alt') + '</div>' +
        '<div class="mid-lab">Ball on</div><div class="stepper"><button class="icon-btn" data-act="ev" data-t="ball" data-p="' + attr({ side: S.ballSide, yd: Math.max(1, S.ballOn - 1) }) + '" aria-label="Back">−</button><b>' + S.ballOn + '</b><button class="icon-btn" data-act="ev" data-t="ball" data-p="' + attr(S.ballOn >= 50 ? { side: E.opp(S.ballSide), yd: 49 } : { side: S.ballSide, yd: S.ballOn + 1 }) + '" aria-label="Forward">+</button></div>' +
        '<div class="arrow-pick">' + evBtn('ball', { side: 'home', yd: S.ballOn }, T('home') + ' side', 'alt' + (S.ballSide === 'home' ? ' on' : '')) + evBtn('ball', { side: 'away', yd: S.ballOn }, T('away') + ' side', 'alt' + (S.ballSide === 'away' ? ' on' : '')) + '</div>' +
        evBtn('flag', { on: !S.flag }, S.flag ? 'Clear flag' : 'Flag on the play', S.flag ? 'yellow' : 'alt') + periodControls();
    }
    case 'hockey': {
      const t = now(), HK = E.SPORTS.hockey;
      const list = ['home', 'away'].map(s => HK.activePen(S, R, s, t).map(pe => '<div class="pen-row"><span>' + T(s) + ' #' + esc(pe.n || '?') + ' · ' + esc(pe.kind === 'double' ? 'double minor' : pe.kind) + '</span><b data-live="pen:' + esc(pe.id) + '" data-spec="{}"></b></div>').join('')).join('');
      const st = HK.strength(S, R, t);
      return '<h3>Penalty box</h3><div class="pens">' + (list || '<div class="small muted">No penalties running.</div>') + '</div><div class="small muted">Strength ' + st.home + ' on ' + st.away + '. Minors release on a power-play goal.</div>' + periodControls();
    }
  }
  return '';
}
function periodControls() {
  const g = G.game, S = G.R.S, sp = E.SPORTS[g.sport], R = g.rules;
  if (S.phase !== 'live' || S.so) return '';
  return '<div class="mid-lab">Period</div><button class="tb alt" data-hold="700" data-act="step" data-id="end">Hold to end ' + esc(sp.label(S, R).short) + '</button>';
}
function baseballPad() {
  const g = G.game, S = G.R.S, R = g.rules, BB = E.SPORTS.baseball;
  const bat = BB.bat(S), fld = E.opp(bat);
  const L = (n, k) => '<span class="lights' + '">' + Array.from({ length: n }, (_, i) => '<i class="' + (i < k ? 'on' : '') + '"></i>').join('') + '</span>';
  const base = (i, x, y) => '<g class="b' + (S.bases[i] ? ' on' : '') + '" data-act="ev" data-t="base" data-p="' + attr({ b: i, on: !S.bases[i] }) + '" role="button" aria-label="' + ['First', 'Second', 'Third'][i] + ' base"><rect x="' + (x - 15) + '" y="' + (y - 15) + '" width="30" height="30" transform="rotate(45 ' + x + ' ' + y + ')"/></g>';
  const n = Math.max(R.innings, S.inning), cols = [];
  for (let i = 1; i <= n; i++) cols.push(i);
  const row = side => '<tr><td>' + esc(teamOf(side).short) + '</td>' + cols.map(i => '<td class="' + (i === S.inning && bat === side ? 'bat' : '') + '">' + (S.line[side][i - 1] === undefined ? '' : S.line[side][i - 1]) + '</td>').join('') + '<td class="tot">' + S.score[side] + '</td><td>' + S.hits[side] + '</td><td>' + S.errors[side] + '</td></tr>';
  const pc = S.pc[fld][S.pitcher[fld] || '?'] || 0;
  return '<section class="bb-pad"><div class="pad mid stack">' +
    '<h3>' + esc(E.SPORTS.baseball.label(S, R).long) + ' · ' + esc(teamOf(bat).name) + ' batting</h3>' +
    '<div class="count"><div><span>BALLS</span>' + L(3, S.balls) + '</div><div><span>STRIKES</span><span class="lights s">' + Array.from({ length: 2 }, (_, i) => '<i class="' + (i < S.strikes ? 'on' : '') + '"></i>').join('') + '</span></div><div><span>OUTS</span><span class="lights o">' + Array.from({ length: 2 }, (_, i) => '<i class="' + (i < S.outs ? 'on' : '') + '"></i>').join('') + '</span></div></div>' +
    '<div class="g2">' + evBtn('pitch', { r: 'ball' }, 'Ball', 'xl', ' style="--tc:#2fbf71;--tf:#03140b"') + evBtn('pitch', { r: 'strike' }, 'Strike', 'xl', ' style="--tc:#ffb31a;--tf:#1a1203"') + '</div>' +
    '<div class="g2">' + evBtn('pitch', { r: 'foul' }, 'Foul', '', ' style="--tc:var(--brand);--tf:var(--brand-ink)"') + evBtn('pitch', { r: 'inplay' }, 'In play', '', ' style="--tc:var(--brand);--tf:var(--brand-ink)"') + '</div>' +
    '<div class="g3">' + evBtn('out', {}, 'Out', '', ' style="--tc:#ff5d52;--tf:#1c0402"') + evBtn('hit', {}, 'Hit', 'alt') + evBtn('error', {}, 'Error', 'alt') + '</div>' +
    '<div class="g2">' + evBtn('score', { side: bat, pts: 1 }, 'Run ' + esc(teamOf(bat).short), '', ' style="' + tStyle(bat) + '"') + evBtn('score', { side: bat, pts: -1 }, 'Remove run', 'sm') + '</div>' +
    '</div><div class="pad mid stack"><h3>Runners</h3>' +
    '<svg class="diamond" viewBox="0 0 160 120">' + base(1, 80, 26) + base(0, 128, 70) + base(2, 32, 70) + '<path class="home-plate" d="M72 104h16v8l-8 6-8-6z"/></svg>' +
    '<div class="small muted">Tap a base to place or clear a runner. Walks force runners automatically.</div>' +
    '<div class="mid-lab">Pitcher for ' + esc(teamOf(fld).short) + '</div><div class="row"><button class="btn" data-act="keypad" data-mode="pitcher" data-side="' + fld + '">#' + esc(S.pitcher[fld] || '—') + '</button><span class="muted">' + pc + ' pitches</span></div>' +
    '<button class="tb alt" data-hold="700" data-act="ev" data-t="half" data-p="{}">Hold to end half-inning</button>' +
    '<div class="scrollx"><table class="line-mini"><thead><tr><th></th>' + cols.map(i => '<th>' + i + '</th>').join('') + '<th>R</th><th>H</th><th>E</th></tr></thead><tbody>' + row('away') + row('home') + '</tbody></table></div>' +
    '</div></section>';
}
function shootoutPad() {
  const g = G.game, S = G.R.S, so = S.so;
  const next = so.k.home.length === so.k.away.length ? so.first : (so.k.home.length < so.k.away.length ? 'home' : 'away');
  const pad = side => '<section class="pad" style="' + tStyle(side) + '"><h3><i></i><span class="ttl">' + esc(teamOf(side).name) + (next === side && !so.w ? ' · up next' : '') + '</span></h3>' +
    '<div class="kicks">' + so.k[side].map(m => '<i class="' + (m ? 'y' : 'n') + '"></i>').join('') + '</div>' +
    '<div class="g2">' + evBtn('kick', { side: side, made: true }, 'Scored', 'xl', so.w ? ' disabled' : '') + evBtn('kick', { side: side, made: false }, 'Missed', 'alt', so.w ? ' disabled' : '') + '</div></section>';
  return '<section class="pads">' + pad('home') + '<section class="pad mid"><h3>' + (g.sport === 'soccer' ? 'Penalty kicks' : 'Shootout') + '</h3><div class="small muted">Best of ' + so.rounds + ', then sudden death. The winner is decided automatically.</div></section>' + pad('away') + '</section>';
}
function viewerPanel() {
  const log = G.R.log.filter(e => !e.isUndo && !e.undone && !e.rej && !e.noop).slice(-8).reverse();
  return '<section class="sec"><div class="sec-h"><h2>Recent</h2><span class="aside">Read-only</span></div><div class="log">' + log.map(logRow).join('') + '</div></section>';
}
function dockHTML() {
  const t = E.undoTarget(G.R.log);
  return '<nav class="dock"><div class="in">' +
    '<button class="btn undo" data-act="undo"' + (t ? '' : ' disabled') + '>' + icon('undo') + '<span class="lbl">Undo</span><span class="what">' + (t ? esc(t.desc) : 'Nothing yet') + '</span></button>' +
    '<button class="btn" data-act="log">' + icon('list') + '<span class="lbl">Log</span></button>' +
    '<button class="btn" data-act="menu">' + icon('more') + '<span class="lbl">More</span></button></div></nav>';
}

/* ------------------------------------------------------------ sheets */
function openKeypad(mode, side, color) {
  const g = G.game, S = G.R.S, t = teamOf(side);
  let val = '';
  let kind = 'minor', col = color || 'Y';
  const titles = { foul: 'Foul', card: color === 'R' ? 'Red card' : 'Yellow card', vcard: 'Card', penalty: 'Penalty', pitcher: 'Pitcher number' };
  const recent = mode === 'foul' ? Object.keys(S.pf[side]).slice(-8) : mode === 'pitcher' ? Object.keys(S.pc[side]).filter(n => n !== '?').slice(-6) : [];
  const extra = () => {
    if (mode === 'penalty') return '<div class="seg" role="group">' + [['minor', 'Minor 2:00'], ['double', 'Double 4:00'], ['major', 'Major 5:00'], ['misconduct', 'Misconduct 10:00']].map(o => '<button aria-pressed="' + (kind === o[0]) + '" data-kp="kind" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    if (mode === 'vcard') return '<div class="seg" role="group">' + [['Y', 'Yellow: warning'], ['R', 'Red: point to opponent']].map(o => '<button aria-pressed="' + (col === o[0]) + '" data-kp="col" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    return '';
  };
  const fouls = n => (S.pf[side][n] || 0);
  const paint = () => {
    el.querySelector('.kp-out').outerHTML = '<div class="kp-out' + (val ? '' : ' empty') + '">' + (val ? '#' + esc(val) : (mode === 'pitcher' ? 'Enter a number' : 'Jersey number (optional)')) + (mode === 'foul' && val ? '<span class="small muted" style="font:500 15px var(--font-b)">' + fouls(val) + ' foul' + (fouls(val) === 1 ? '' : 's') + ' so far</span>' : '') + '</div>';
    const ex = el.querySelector('[data-extra]'); if (ex) ex.innerHTML = extra();
  };
  const html = sheetHead(titles[mode] + ' · ' + t.short) +
    '<div class="kp-out empty"></div>' +
    (recent.length ? '<div class="recent">' + recent.map(n => '<button class="chip" data-kp="num" data-v="' + esc(n) + '">#' + esc(n) + (mode === 'foul' ? ' · ' + fouls(n) : '') + '</button>').join('') + '</div>' : '') +
    '<div data-extra>' + extra() + '</div>' +
    '<div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-kp="d" data-v="' + n + '">' + n + '</button>').join('') + '<button class="fn" data-kp="clr">Clear</button><button data-kp="d" data-v="0">0</button><button class="fn" data-kp="bs">⌫</button></div>' +
    '<div class="row end">' + (mode === 'foul' ? '<button class="btn big" data-kp="team">Team foul only</button>' : '') + '<button class="btn primary big" data-kp="ok">' + icon('check') + ' ' + (mode === 'foul' ? 'Record foul' : mode === 'pitcher' ? 'Set pitcher' : 'Record') + '</button></div>';
  const el = openSheet(html);
  paint();
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-kp]'); if (!b) return;
    const k = b.dataset.kp;
    if (k === 'd' && val.length < 3) val += b.dataset.v;
    else if (k === 'bs') val = val.slice(0, -1);
    else if (k === 'clr') val = '';
    else if (k === 'num') val = b.dataset.v;
    else if (k === 'kind') kind = b.dataset.v;
    else if (k === 'col') col = b.dataset.v;
    else if (k === 'team' || k === 'ok') {
      const num = k === 'team' ? '' : val;
      closeSheet();
      if (mode === 'foul') dispatch('foul', num ? { side: side, player: num } : { side: side });
      else if (mode === 'card') dispatch('card', { side: side, color: col, player: num });
      else if (mode === 'vcard') dispatch('card', { side: side, color: col, player: num });
      else if (mode === 'penalty') dispatch('penalty', { side: side, kind: kind, player: num });
      else if (mode === 'pitcher') { if (num) dispatch('pitcher', { side: side, num: num }); }
      return;
    }
    paint();
  });
  el.addEventListener('keydown', e => {
    if (/^[0-9]$/.test(e.key) && val.length < 3) { val += e.key; paint(); }
    else if (e.key === 'Backspace') { val = val.slice(0, -1); paint(); }
    else if (e.key === 'Enter') { const ok = el.querySelector('[data-kp="ok"]'); if (ok) ok.click(); }
  });
}
function openClockSheet(k) {
  const g = G.game, S = G.R.S, sp = E.SPORTS[g.sport], R = g.rules, c = S.clocks[k];
  if (!c) return;
  const cur = E.clockValue(S, k, now());
  const m = Math.floor(cur / 60000), s = Math.floor((cur % 60000) / 1000), t = Math.floor((cur % 1000) / 100);
  const name = { game: 'Game clock', shot: 'Shot clock', play: 'Play clock', pitch: 'Pitch clock', brk: 'Break clock' }[k];
  const presets = [];
  if (k === 'game' && sp.periodMs) presets.push([c.dir === 'up' ? 0 : sp.periodMs(S, R), c.dir === 'up' ? '0:00' : 'Full ' + sp.label(S, R).short]);
  if (k === 'game' && c.dir !== 'up') presets.push([60000, '1:00'], [30000, '0:30']);
  if (k === 'shot') presets.push([R.shotFull * 1000, R.shotFull + 's']);
  if (k === 'brk') presets.push([60000, '1:00'], [5 * 60000, '5:00'], [10 * 60000, '10:00'], [15 * 60000, '15:00']);
  const el = openSheet(sheetHead('Set ' + name) +
    '<div class="row" style="justify-content:center;gap:6px;font:800 40px/1 var(--font-d)"><input class="input codein" id="ck-m" inputmode="numeric" maxlength="3" value="' + m + '" style="width:110px" aria-label="Minutes">:<input class="input codein" id="ck-s" inputmode="numeric" maxlength="2" value="' + pad2(s) + '" style="width:110px" aria-label="Seconds">.<input class="input codein" id="ck-t" inputmode="numeric" maxlength="1" value="' + t + '" style="width:80px" aria-label="Tenths"></div>' +
    (presets.length ? '<div class="recent">' + presets.map(p => '<button class="chip" data-ck="' + p[0] + '">' + esc(p[1]) + '</button>').join('') + '</div>' : '') +
    '<p class="note">Other controllers see a notice when the clock is set. The last setting wins.</p>' +
    '<div class="row end"><button class="btn big" data-ck="set">Set</button>' + (S.phase === 'live' || k !== 'game' ? '<button class="btn go big" data-ck="run">Set and start</button>' : '') + '</div>');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ck]'); if (!b) return;
    const v = b.dataset.ck;
    let ms;
    if (v === 'set' || v === 'run') {
      ms = (clampInt($('#ck-m').value, 0, 360, 0) * 60 + clampInt($('#ck-s').value, 0, 59, 0)) * 1000 + clampInt($('#ck-t').value, 0, 9, 0) * 100;
    } else ms = +v;
    closeSheet();
    dispatch('clock', { k: k, a: 'set', ms: ms, run: v === 'run' ? true : undefined });
  });
}
const pad2 = n => (n < 10 ? '0' : '') + n;
function openCorrections() {
  const g = G.game, S = G.R.S, sp = g.sport;
  const paths = E.CORRECTABLE.common.concat(E.CORRECTABLE[sp] || []);
  const get = p => { if (p === 'period') return sp === 'baseball' ? S.inning : S.period; return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S); };
  const vals = {}; paths.forEach(p => { vals[p] = get(p); });
  const next = Object.assign({}, vals);
  const rows = () => paths.filter(p => typeof vals[p] === 'number').map(p => '<div class="corr-row"><span>' + esc(E.labelPath(p, g).replace(/^./, c => c.toUpperCase())) + '</span><button class="icon-btn" data-c="-" data-p="' + p + '" aria-label="Less">−</button><b class="' + (next[p] !== vals[p] ? 'chg' : '') + '">' + next[p] + '</b><button class="icon-btn" data-c="+" data-p="' + p + '" aria-label="More">+</button></div>').join('');
  const reasons = ['Scorer error', 'Official\'s ruling', 'Missed at the table', 'Clock operator'];
  const el = openSheet(sheetHead('Correct a value') + '<p class="muted" style="margin:0">Every correction is logged with its reason, device and the before and after values.</p><div class="corr" data-rows>' + rows() + '</div>' +
    '<label class="field"><span>Reason</span><input class="input" id="corr-why" maxlength="80" placeholder="Required"></label><div class="recent">' + reasons.map(r => '<button class="chip" data-why="' + esc(r) + '">' + esc(r) + '</button>').join('') + '</div>' +
    '<div class="row end"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary big" data-c="apply">Apply corrections</button></div>');
  el.addEventListener('click', e => {
    const w = e.target.closest('[data-why]'); if (w) { $('#corr-why').value = w.dataset.why; return; }
    const b = e.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === 'apply') {
      const why = $('#corr-why').value.trim();
      const changed = paths.filter(p => next[p] !== vals[p]);
      if (!changed.length) return toast('Nothing changed yet.');
      if (!why) { toast('Add a reason so the log explains the change.', 'alert'); $('#corr-why').focus(); return; }
      closeSheet();
      changed.forEach(p => dispatch('set', { path: p, value: next[p], reason: why }));
      return;
    }
    const p = b.dataset.p;
    next[p] = Math.max(p === 'period' ? 1 : 0, next[p] + (b.dataset.c === '+' ? 1 : -1));
    el.querySelector('[data-rows]').innerHTML = rows();
  });
}
function logRow(e) {
  const ev = e.ev;
  const chg = (e.diff || []).filter(d => d.k !== 'Status').slice(0, 4).map(d => esc(d.k) + ': <s>' + esc(d.from) + '</s> → ' + esc(d.to)).join('<br>');
  let tag = '';
  if (e.rej) tag = '<span class="tag rej">Rejected</span>';
  else if (e.undone) tag = '<span class="tag">Undone</span>';
  else if (e.alert) tag = '<span class="tag note">Alert</span>';
  const act = e.isUndo || e.rej || e.noop ? '' : (e.undone ? '<button class="btn" data-act="restore" data-id="' + esc(ev.id) + '">Restore</button>' : '<button class="btn" data-act="undoOne" data-id="' + esc(ev.id) + '">Undo</button>');
  return '<div class="log-row' + (e.undone ? ' undone' : '') + '"><time>' + esc(fmtTime(ev.at)) + '</time><div class="d"><b>' + esc(e.desc) + '</b>' +
    '<span class="by">' + esc(ev.d || 'Unknown device') + (ev.r ? ' · ' + esc(ev.r) : '') + ' ' + tag + '</span>' +
    (e.rej ? '<span class="chg">' + esc(e.rej) + '</span>' : '') + (e.note && !e.rej ? '<span class="chg">' + esc(e.note) + '</span>' : '') +
    (chg && !e.rej ? '<span class="chg">' + chg + '</span>' : '') + '</div>' + act + '</div>';
}
let LOG_FILTER = 'all';
function openLog() {
  const paintLog = () => {
    const f = LOG_FILTER;
    const rows = G.R.log.slice().reverse().filter(e => {
      if (f === 'all') return true;
      if (f === 'score') return e.ev.t === 'score' || e.ev.t === 'kick';
      if (f === 'clock') return e.ev.t === 'clock' || e.ev.t === 'endp' || e.ev.t === 'nextp';
      if (f === 'fix') return e.ev.t === 'set' || e.isUndo || e.undone || e.rej;
      return true;
    });
    return rows.length ? rows.map(logRow).join('') : '<p class="muted">Nothing here yet.</p>';
  };
  const filters = [['all', 'All'], ['score', 'Scoring'], ['clock', 'Clock and periods'], ['fix', 'Undo and corrections']];
  const el = openSheet(sheetHead('Event log') +
    '<div class="filters">' + filters.map(x => '<button class="chip" aria-pressed="' + (LOG_FILTER === x[0]) + '" data-lf="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="log" data-logrows>' + paintLog() + '</div>' +
    '<div class="row end"><button class="btn" data-act="copyCsv">' + icon('copy') + ' Copy as CSV</button>' + (canDownload() ? '<button class="btn" data-act="saveCsv">' + icon('download') + ' Download CSV</button>' : '') + '</div>');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-lf]'); if (!b) return;
    LOG_FILTER = b.dataset.lf;
    $$('[data-lf]', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.lf === LOG_FILTER));
    el.querySelector('[data-logrows]').innerHTML = paintLog();
  });
  SHEET.opts.refresh = () => { const r = el.querySelector('[data-logrows]'); if (r) r.innerHTML = paintLog(); };
}
function csvOf(game, log) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['seq', 'time', 'device', 'role', 'action', 'status', 'note', 'changes', 'event id'];
  const rows = log.map((e, i) => [i + 1, new Date(e.ev.at).toISOString(), e.ev.d || '', e.ev.r || '', e.desc, e.rej ? 'rejected' : e.undone ? 'undone' : e.isUndo ? 'undo' : 'applied', e.rej || e.note || '', (e.diff || []).map(d => d.k + ': ' + d.from + ' -> ' + d.to).join('; '), e.ev.id]);
  return [head].concat(rows).map(r => r.map(q).join(',')).join('\n');
}
let DL = null;   // the page's downloads capability, when hosted on Claude
if (IN_ARTIFACT) { try { window.claude.use('downloads').then(ns => { DL = ns || null; }, () => {}); } catch (e) {} }
function canDownload() { return !IN_ARTIFACT || !!DL; }
function copyText(text, okMsg) {
  const done = () => toast(okMsg || 'Copied');
  try { navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, okMsg)); } catch (e) { fallbackCopy(text, okMsg); }
}
function fallbackCopy(text, okMsg) {
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  toast(ok ? (okMsg || 'Copied') : 'Copy blocked here. Select the text and copy it yourself.', ok ? '' : 'warn');
}
function saveFile(name, text, type) {
  if (IN_ARTIFACT) {
    if (!DL) return toast('Saving files is not available here. Use Copy instead.', 'warn');
    DL.save({ filename: name, data: text }).then(r => { if (r && r.status === 'saved') toast('Saved ' + name); }, err => {
      const c = err && err.code;
      if (c === 'declined') return;
      toast(c === 'rate_limited' ? 'A save prompt is already open.' : 'Could not save the file here. Use Copy instead.', 'warn');
    });
    return;
  }
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function openMenu() {
  const g = G.game, S = G.R.S;
  const roles = [['controller', 'Controller'], ['clock', 'Clock only'], ['viewer', 'Viewer']];
  openSheet(sheetHead('Game') +
    '<div class="menu">' +
    '<button class="btn" data-act="invite">' + icon('qr') + ' Add a device (code ' + esc(g.code) + ')</button>' +
    '<button class="btn" data-act="openDisplay">' + icon('monitor') + ' Show the display on this device</button>' +
    '<button class="btn" data-act="boardSettings">' + icon('sliders') + ' Board and screen settings</button>' +
    '<button class="btn" data-act="corrections"' + (S.phase === 'final' ? ' disabled' : '') + '>' + icon('edit') + ' Correct a value</button>' +
    '<button class="btn" data-act="log">' + icon('list') + ' Event log</button>' +
    '<div class="field"><span>This device</span><div class="seg">' + roles.map(r => '<button aria-pressed="' + (G.role === r[0]) + '" data-act="setRole" data-role="' + r[0] + '">' + r[1] + '</button>').join('') + '</div></div>' +
    (S.phase !== 'final' ? '<button class="btn danger" data-hold="1200" data-act="endGame">' + icon('flag') + ' Hold to end the game now</button>' : '<button class="btn" data-act="summaryCur">' + icon('history') + ' Game summary</button>') +
    '<button class="btn" data-act="leave">' + icon('home') + ' Leave to home screen</button>' +
    '</div>');
}
function openBoardSettings() {
  const g = G.game, d = dispOf(g);
  const seg = (k, opts) => '<span class="seg">' + opts.map(o => '<button aria-pressed="' + (String(d[k]) === String(o[0])) + '" data-bs="' + k + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>').join('') + '</span>';
  const el = openSheet(sheetHead('Board and screen') +
    '<div class="field"><span>Screen shape</span><select class="select" id="bs-aspect">' + ASPECTS.filter(a => a.id !== 'custom' || d.aspect === 'custom').map(a => '<option value="' + a.id + '"' + (d.aspect === a.id ? ' selected' : '') + '>' + esc(a.label + ' · ' + (a.id === 'custom' ? d.w + '×' + d.h : a.w + '×' + a.h) + ' · ' + a.use) + '</option>').join('') + '</select></div>' +
    '<div class="opt-row"><span>Digits</span>' + seg('style', [['modern', 'Modern'], ['led', 'LED segments']]) + '</div>' +
    '<div class="opt-row"><span>Board</span>' + seg('mode', [['dark', 'Dark'], ['light', 'Light']]) + seg('bg', [['gradient', 'Team glow'], ['solid', 'Solid']]) + '</div>' +
    '<div class="opt-row"><span>Typeface</span><select class="select" id="bs-font" style="max-width:220px">' + FONTS.map(f => '<option value="' + f[0] + '"' + (d.font === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>').join('') + '</select></div>' +
    '<div class="opt-row"><span>Colours</span><span class="seg"><button data-bs="swapc" data-v="home">Alternate ' + esc(g.teams.home.short) + '</button><button data-bs="swapc" data-v="away">Alternate ' + esc(g.teams.away.short) + '</button></span></div>' +
    '<p class="note">Changes reach every linked display right away.</p>');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-bs]'); if (!b) return;
    const k = b.dataset.bs, v = b.dataset.v;
    if (k === 'swapc') updateDef(x => { const t = x.teams[v]; const c = t.c1; t.c1 = t.c2; t.c2 = c; });
    else updateDef(x => { x.display[k] = v; });
    closeSheet(); openBoardSettings();
  });
  el.addEventListener('change', e => {
    if (e.target.id === 'bs-aspect') updateDef(x => { x.display.aspect = e.target.value; });
    if (e.target.id === 'bs-font') updateDef(x => { x.display.font = e.target.value; });
  });
}
function openInviteSheet() { openSheet(sheetHead('Add a device') + inviteBlock(true)); }

/* ============================================================ display */
function viewDisplay() {
  return '<div class="disp" id="disp"><div class="stage" data-board="disp"></div>' +
    '<div class="disp-ui"><button class="btn" data-act="fullscreen">' + icon('expand') + ' Full screen</button><button class="btn" data-act="toggleJoin">' + icon('qr') + ' Join code</button>' +
    '<button class="btn" data-act="backToCtl">' + icon('tablet') + ' Controller</button>' +
    '<button class="btn" data-act="leave">' + icon('x') + ' Exit</button></div></div>';
}
function paintDisplay() {
  const box = $('#disp .stage');
  if (box && G.game && G.R) mountBoard(box, G.game, G.R.S, { showJoin: G.showJoin || G.R.S.phase === 'pre' });
}
let uiTimer = null;
function wakeUI() {
  const d = $('#disp'); if (!d) return;
  d.classList.add('ui'); clearTimeout(uiTimer);
  uiTimer = setTimeout(() => d.classList.remove('ui'), 3200);
}
let wake = null;
function requestWake() { try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); } catch (e) {} }
function releaseWake() { try { if (wake) wake.release(); } catch (e) {} wake = null; }

/* ============================================================== teams */
function viewTeams() {
  const rows = TEAMS.map(t => '<button class="li" data-act="editTeam" data-id="' + esc(t.id) + '"><span class="badge">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : '') + '</span><span class="grow"><b>' + esc(t.name) + '</b><span><span class="mono">' + esc(t.short) + '</span> · <span class="swatch" style="display:inline-flex;vertical-align:middle"><i style="background:' + t.c1 + '"></i><i style="background:' + t.c2 + '"></i></span>' + (t.example ? ' · Example' : '') + '</span></span>' + icon('chev') + '</button>').join('');
  return topBar('<button class="icon-btn" data-act="back" aria-label="Back">' + icon('back') + '</button><h1>Team library</h1><button class="btn primary" data-act="editTeam" data-id="">' + icon('plus') + ' New team</button>') +
    '<main class="page narrow gutter"><p class="muted" style="margin:0">Colours, short names and logos are reused for every game. The example teams are made up; replace them with your own.</p>' +
    '<div class="list">' + (rows || '<div class="li">No teams yet.</div>') + '</div></main>';
}
function openTeamEditor(id) {
  const orig = teamById(id);
  const t = orig ? Object.assign({}, orig) : { id: 't' + rid(8), name: '', short: '', c1: '#1f4fd1', c2: '#ffffff', logo: null, sports: [] };
  const paint = () => {
    const tf = textOn(t.c1), cr = contrast(t.c1, tf);
    return '<div class="contrast"><span class="smp" style="background:' + t.c1 + ';color:' + tf + '">' + esc(t.short || 'ABC') + '</span><span>Text on primary: <b>' + (tf === '#ffffff' ? 'white' : 'black') + '</b>, contrast ' + cr.toFixed(1) + ':1 ' + (cr >= 7 ? '<span class="tag ok">AAA</span>' : cr >= 4.5 ? '<span class="tag ok">AA</span>' : '<span class="tag rej">Low</span>') + '</span></div>' +
      (contrast(t.c1, t.c2) < 1.6 ? '<p class="note" style="color:var(--warn)">Primary and secondary are very close. The accent stripe will be hard to see.</p>' : '');
  };
  const el = openSheet(sheetHead(orig ? 'Edit team' : 'New team') +
    '<div class="fields"><label class="field"><span>Team name</span><input class="input" id="te-name" maxlength="40" value="' + esc(t.name) + '" placeholder="Ridgeview Ravens" autofocus></label>' +
    '<label class="field"><span>Short name</span><input class="input" id="te-short" maxlength="4" value="' + esc(t.short) + '" placeholder="RVR" style="text-transform:uppercase"><small>Two to four letters for ribbons and the log</small></label></div>' +
    '<div class="field"><span>Primary colour</span><div class="color-row"><span class="muted small">Score panels and bands</span><input type="color" id="te-c1" value="' + t.c1 + '" aria-label="Primary colour"><input class="input mono" id="te-c1h" value="' + t.c1 + '" maxlength="7" aria-label="Primary hex"></div></div>' +
    '<div class="field"><span>Secondary colour</span><div class="color-row"><span class="muted small">Accent stripe and alternate kit</span><input type="color" id="te-c2" value="' + t.c2 + '" aria-label="Secondary colour"><input class="input mono" id="te-c2h" value="' + t.c2 + '" maxlength="7" aria-label="Secondary hex"></div></div>' +
    '<div data-contrast>' + paint() + '</div>' +
    '<div class="field"><span>Logo or mascot</span><div class="logo-drop"><span class="badge" data-logo>' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : '') + '</span>' +
    '<div class="stack" style="gap:8px"><label class="btn">' + icon('upload') + ' Upload PNG, SVG or JPG<input type="file" id="te-file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden></label>' +
    '<div class="row"><button class="btn" data-te="mono">Use monogram</button><button class="btn" data-te="clear">Remove</button></div>' +
    '<label class="toggle small" style="min-height:0"><span>Remove a white background</span><button class="switch" role="switch" aria-checked="false" data-te="knock" aria-label="Remove white background"></button></label></div></div>' +
    '<small class="muted">A transparent PNG or SVG looks best. Uploads are resized to 256 px.</small></div>' +
    '<div class="row end">' + (orig ? '<button class="btn danger" data-te="del">' + icon('trash') + ' Delete</button><span class="grow"></span>' : '') + '<button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary big" data-te="save">Save team</button></div>');
  let knock = false;
  const setColor = (k, v) => { if (!hexOk(v)) return; t[k] = v.toLowerCase(); $('#te-' + k).value = t[k]; $('#te-' + k + 'h').value = t[k]; el.querySelector('[data-contrast]').innerHTML = paint(); };
  el.addEventListener('input', e => {
    const id2 = e.target.id;
    if (id2 === 'te-c1' || id2 === 'te-c2') setColor(id2.slice(3), e.target.value);
    if (id2 === 'te-c1h' || id2 === 'te-c2h') { let v = e.target.value.trim(); if (v[0] !== '#') v = '#' + v; if (hexOk(v)) setColor(id2.slice(3, 5), v); }
    if (id2 === 'te-short') { t.short = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); el.querySelector('[data-contrast]').innerHTML = paint(); }
    if (id2 === 'te-name') { t.name = e.target.value; if (!$('#te-short').value) { const auto = autoShort(t.name); $('#te-short').placeholder = auto || 'RVR'; } }
  });
  el.addEventListener('change', async e => {
    if (e.target.id !== 'te-file' || !e.target.files[0]) return;
    const f = e.target.files[0];
    if (f.size > 8 * 1024 * 1024) return toast('That file is over 8 MB. Try a smaller logo.', 'alert');
    try { t.logo = await processLogo(f, knock); el.querySelector('[data-logo]').innerHTML = '<img src="' + esc(t.logo) + '" alt="">'; }
    catch (err) { toast('Could not read that image.', 'alert'); }
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-te]'); if (!b) return;
    const k = b.dataset.te;
    if (k === 'knock') { knock = !knock; b.setAttribute('aria-checked', knock); return; }
    if (k === 'mono') { t.logo = monogram({ c1: t.c1, c2: t.c2, short: t.short || autoShort(t.name), mono: (t.short || autoShort(t.name)).slice(0, 2), shape: 'shield' }); el.querySelector('[data-logo]').innerHTML = '<img src="' + esc(t.logo) + '" alt="">'; return; }
    if (k === 'clear') { t.logo = null; el.querySelector('[data-logo]').innerHTML = ''; return; }
    if (k === 'del') {
      if (TEAMS.length <= 2) return toast('Keep at least two teams in the library.', 'alert');
      TEAMS = TEAMS.filter(x => x.id !== t.id); saveTeams(); closeSheet(); render(); toast('Team deleted'); return;
    }
    if (k === 'save') {
      t.name = $('#te-name').value.trim().slice(0, 40);
      t.short = ($('#te-short').value || autoShort(t.name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!t.name) { toast('Give the team a name.', 'alert'); $('#te-name').focus(); return; }
      if (!t.short) t.short = t.name.slice(0, 3).toUpperCase();
      if (!t.logo) t.logo = monogram({ c1: t.c1, c2: t.c2, mono: t.short.slice(0, 2), shape: 'shield' });
      delete t.example;
      const i = TEAMS.findIndex(x => x.id === t.id);
      if (i >= 0) TEAMS[i] = t; else TEAMS.push(t);
      saveTeams(); closeSheet();
      if (SHEET_RETURN) { const r = SHEET_RETURN; SHEET_RETURN = null; DRAFT[r] = t.id; draftGameCache = null; }
      render(); toast('Saved ' + t.name);
    }
  });
}
let SHEET_RETURN = null;
function autoShort(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return w.map(x => x[0]).join('').slice(0, 3).toUpperCase();
}
function processLogo(file, knock) {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onerror = rej;
    rd.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const max = 256, sc = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
        const w = Math.max(1, Math.round((img.naturalWidth || max) * sc)), h = Math.max(1, Math.round((img.naturalHeight || max) * sc));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
        if (knock) knockWhite(cx, w, h);
        let out = cv.toDataURL('image/png');
        if (out.length > 160000) { const wp = cv.toDataURL('image/webp', 0.9); if (wp.indexOf('data:image/webp') === 0 && wp.length < out.length) out = wp; }
        res(out);
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}
/* Flood-fill near-white pixels from the edges so white inside the logo stays. */
function knockWhite(cx, w, h) {
  const d = cx.getImageData(0, 0, w, h), px = d.data, seen = new Uint8Array(w * h), q = [];
  const white = i => px[i * 4 + 3] > 0 && px[i * 4] > 232 && px[i * 4 + 1] > 232 && px[i * 4 + 2] > 232;
  for (let x = 0; x < w; x++) { q.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { q.push(y * w, y * w + w - 1); }
  while (q.length) {
    const i = q.pop();
    if (seen[i] || !white(i)) continue;
    seen[i] = 1; px[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) q.push(i - 1); if (x < w - 1) q.push(i + 1); if (y > 0) q.push(i - w); if (y < h - 1) q.push(i + w);
  }
  cx.putImageData(d, 0, 0);
}
function openTeamPicker(side) {
  const other = DRAFT[side === 'home' ? 'away' : 'home'];
  openSheet(sheetHead((side === 'home' ? 'Home' : 'Away') + ' team') +
    '<div class="list">' + TEAMS.map(t => '<button class="li" data-act="choose" data-side="' + side + '" data-id="' + esc(t.id) + '"' + (t.id === other ? ' disabled' : '') + '><span class="badge">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : '') + '</span><span class="grow"><b>' + esc(t.name) + '</b><span>' + esc(t.short) + (t.id === other ? ' · already the other team' : '') + '</span></span>' + (DRAFT[side] === t.id ? icon('check') : '') + '</button>').join('') + '</div>' +
    '<button class="btn block" data-act="quickTeam" data-side="' + side + '">' + icon('plus') + ' Add a new team</button>');
}

/* ===================================================== history, summary */
function viewHistory() {
  const idx = Store.get('games', []);
  const rows = idx.map(x => {
    const sp = E.SPORTS[x.sport];
    const st = x.phase === 'final' ? 'Final' : x.phase === 'pre' ? 'Pregame' : 'In progress';
    return '<button class="li" data-act="openSummary" data-id="' + esc(x.id) + '"><span class="sport-ico">' + sportIcon(x.sport) + '</span><span class="grow"><b>' + esc(x.home.short) + ' ' + x.score.home + ' – ' + x.score.away + ' ' + esc(x.away.short) + '</b><span>' + esc(sp ? sp.name : x.sport) + ' · ' + esc(st) + ' · ' + esc(fmtDate(x.createdAt || x.updatedAt)) + '</span></span>' + icon('chev') + '</button>';
  }).join('');
  return topBar('<button class="icon-btn" data-act="nav" data-to="home" aria-label="Back">' + icon('back') + '</button><h1>Game history</h1>') +
    '<main class="page narrow gutter"><div class="list">' + (rows || '<div class="li"><span class="grow muted">No games yet. Finished games land here with their full event log.</span></div>') + '</div>' +
    '<p class="note">History is stored on this device. A production version would keep it per organization and venue.</p></main>';
}
function summaryText(g, S) {
  const sp = E.SPORTS[g.sport], b = E.breakdown(g, S);
  const lines = [];
  lines.push((S.phase === 'final' ? 'FINAL' : 'IN PROGRESS') + ' · ' + sp.name + ' (' + (sp.presets.find(p => p.id === g.presetId) || {}).org + ')');
  lines.push(g.teams.home.name + ' ' + S.score.home + ' – ' + S.score.away + ' ' + g.teams.away.name + (S.so && S.so.w ? ' (' + (g.sport === 'soccer' ? 'PK ' : 'SO ') + S.so.k.home.filter(Boolean).length + '–' + S.so.k.away.filter(Boolean).length + ')' : ''));
  if (b.cols.length) lines.push(b.cols.map((c, i) => c + ' ' + (b.rows.home[i] == null ? '-' : b.rows.home[i]) + '–' + (b.rows.away[i] == null ? '-' : b.rows.away[i])).join(' · '));
  const sum = sp.summary(S, g.rules, g);
  lines.push(Object.keys(sum).map(k => k + ': ' + sum[k]).join(' · '));
  if (g.venue) lines.push(g.venue);
  return lines.join('\n');
}
function viewSummary() {
  const rec = loadGame(ROUTE.id);
  if (!rec) return viewHistory();
  const g = sanitizeGame(rec.game); if (!g) return viewHistory();
  const evs = (rec.events || []).filter(Sync.validEv);
  const R = E.replay(g, evs), S = R.S, sp = E.SPORTS[g.sport], b = E.breakdown(g, S);
  const first = g.sport === 'baseball' ? 'away' : 'home';
  const row = side => '<tr class="' + (S.winner === side ? 'w' : '') + '"><td>' + esc(g.teams[side].name) + '</td>' + b.rows[side].map(v => '<td>' + (v == null ? '' : v) + '</td>').join('') + b.tails[side].map(v => '<td class="tot">' + v + '</td>').join('') + '</tr>';
  const sum = sp.summary(S, g.rules, g);
  const isCur = G.game && G.game.id === g.id;
  return topBar('<button class="icon-btn" data-act="back" aria-label="Back">' + icon('back') + '</button><h1>' + esc(g.teams.home.short + ' vs ' + g.teams.away.short) + '</h1>') +
    '<main class="page narrow gutter">' +
    '<div class="resume"><div class="resume-board stage" data-board="summary" data-id="' + esc(g.id) + '"></div></div>' +
    '<section class="sec"><div class="sec-h"><h2>' + (S.phase === 'final' ? 'Final' : 'In progress') + '</h2><span class="aside">' + esc(sp.name) + ' · ' + esc(fmtDate(g.createdAt)) + '</span></div>' +
    '<div class="scrollx"><table class="summary-table"><thead><tr><th></th>' + b.cols.map(c => '<th>' + esc(c) + '</th>').join('') + b.tail.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + row(first) + row(E.opp(first)) + '</tbody></table></div>' +
    '<dl class="kv">' + Object.keys(sum).map(k => '<dt>' + esc(k) + '</dt><dd>' + esc(sum[k]) + '</dd>').join('') + '<dt>Actions logged</dt><dd>' + R.log.length + '</dd><dt>Undos</dt><dd>' + R.log.filter(e => e.isUndo).length + '</dd><dt>Rules</dt><dd>' + esc((sp.presets.find(p => p.id === g.presetId) || {}).org + ' · ' + g.rulesVersion) + '</dd></dl>' +
    '<div class="row"><button class="btn" data-act="copySummary" data-id="' + esc(g.id) + '">' + icon('copy') + ' Copy summary</button><button class="btn" data-act="copyCsvFor" data-id="' + esc(g.id) + '">' + icon('list') + ' Copy log as CSV</button>' + (canDownload() ? '<button class="btn" data-act="saveCsvFor" data-id="' + esc(g.id) + '">' + icon('download') + ' Download CSV</button>' : '') + '</div></section>' +
    '<div class="row">' + (isCur ? '<button class="btn primary" data-act="backToCtl">' + icon('tablet') + ' Back to controller</button>' : '<button class="btn primary" data-act="resume" data-id="' + esc(g.id) + '" data-role="controller">' + icon('tablet') + ' Open in controller</button>') +
    '<button class="btn danger" data-hold="1000" data-act="deleteGame" data-id="' + esc(g.id) + '">' + icon('trash') + ' Hold to delete</button></div>' +
    '</main>';
}

/* ================================================================ about */
function openAbout() {
  openSheet(sheetHead('About this prototype') + '<div class="prose">' +
    '<p>A working prototype of the Multi-Sport Scoreboard PRD (draft v0.1). Everything runs in the browser, with no server.</p>' +
    '<ul><li><b>Six sports</b> from the MVP and v1 sets, each with data-driven, versioned presets you can adjust per game.</li>' +
    '<li><b>Event log as the source of truth.</b> Undo, restore, corrections with reasons, and an audit log with before and after values.</li>' +
    '<li><b>Clocks run from timestamps</b>, so displays keep time on their own and offline actions replay at the moment they happened.</li>' +
    '<li><b>Linking:</b> windows of one browser sync instantly. ' + (IN_ARTIFACT ? 'On this Claude-hosted page, signed-in teammates link live.' : 'The installed app links devices over WebRTC, matched through the public PeerJS broker.') + '</li>' +
    '<li><b>Screens:</b> 16:9, 9:16, 4:3, ultra-wide, ribbon and custom pixel sizes, each with its own layout and safe area.</li></ul>' +
    '<p class="muted">Not in this prototype: accounts and server-side roles, SSO, screenRIG Player LAN fallback, horns, sponsor zones, and phase 2 sports. Rule defaults still need validation with governing bodies.</p>' +
    (IN_ARTIFACT ? '' : '<p class="muted">To install on iPad: Share, then Add to Home Screen. On Android and desktop Chrome, use Install app.</p>') +
    '<p class="muted mono small">Device ' + esc(DEVICE.name) + ' · ' + esc(DEVICE.id) + ' · rules ' + esc(E.RULES_VERSION) + '</p></div>');
}

/* ============================================================== actions */
function stepAction(id) {
  const S = G.R.S;
  if (id === 'start') return dispatch('start');
  if (id === 'end') return dispatch('endp');
  if (id === 'next') return dispatch('nextp');
  if (id === 'final') return dispatch('final');
  if (id === 'reopen') {
    const f = G.R.log.slice().reverse().find(e => e.ev.t === 'final' && !e.undone && !e.rej && !e.noop);
    if (f) { dispatch('undo', { target: f.ev.id }); toast('Game reopened'); }
    return;
  }
  if (id === 'so') {
    const T = s => G.game.teams[s];
    openSheet(sheetHead(G.game.sport === 'soccer' ? 'Penalty kicks' : 'Shootout') + '<p class="muted" style="margin:0">Who shoots first?</p><div class="row"><button class="btn big grow" data-act="soFirst" data-side="home">' + esc(T('home').name) + '</button><button class="btn big grow" data-act="soFirst" data-side="away">' + esc(T('away').name) + '</button></div>');
  }
}
const ACT = {
  nav(el) { if (el.dataset.to === 'setup') { DRAFT = DRAFT || newDraft(); } go(el.dataset.to, { from: ROUTE.v }); },
  back() {
    const f = ROUTE.from;
    if (f === 'control' && G.game) return go('control');
    if (f === 'setup' && DRAFT) return go('setup');
    if (f === 'history') return go('history');
    go(ROUTE.v === 'summary' ? 'history' : 'home');
  },
  closeSheet() { closeSheet(); },
  about() { openAbout(); },
  install() { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; render(); } },
  rename() {
    const el = openSheet(sheetHead('Device name') + '<p class="muted" style="margin:0">Shown in the event log and to other linked devices.</p><input class="input" id="dev-name" maxlength="30" value="' + esc(DEVICE.name) + '" autofocus><div class="row end"><button class="btn primary" data-act="saveName">Save</button></div>');
    el.querySelector('#dev-name').addEventListener('keydown', e => { if (e.key === 'Enter') ACT.saveName(); });
  },
  saveName() { const v = ($('#dev-name').value || '').trim().slice(0, 30); if (v) { DEVICE.name = v; Store.set('device', DEVICE); if (G.link) { G.link.o.name = v; G.link.hello(); } } closeSheet(); render(); },
  resume(el) { const role = el.dataset.role; openGame(el.dataset.id, role === 'display' ? 'display' : 'controller', role === 'display' ? 'display' : 'control'); },
  /* setup */
  dSport(el) { const id = el.dataset.id; if (id === DRAFT.sport) return; DRAFT.sport = id; DRAFT.presetId = (PREFS.preset || {})[id] || E.SPORTS[id].presets[0].id; DRAFT.ov = {}; render(); },
  dPreset(el) { DRAFT.presetId = el.dataset.id; DRAFT.ov = {}; render(); },
  dResetOv() { DRAFT.ov = {}; render(); },
  dOvBool(el) { const k = el.dataset.k; const R = E.resolveRules(DRAFT.sport, DRAFT.presetId, DRAFT.ov); setOv(k, !R[k]); render(); },
  dSwap() { const h = DRAFT.home; DRAFT.home = DRAFT.away; DRAFT.away = h; const a = DRAFT.alt.home; DRAFT.alt.home = DRAFT.alt.away; DRAFT.alt.away = a; render(); },
  dAlt(el) { DRAFT.alt[el.dataset.side] = !DRAFT.alt[el.dataset.side]; render(); },
  dAspect(el) { DRAFT.display.aspect = el.dataset.id; render(); },
  dDisp(el) { DRAFT.display[el.dataset.k] = el.dataset.v; render(); },
  dAnim() { DRAFT.display.anim = DRAFT.display.anim === false; render(); },
  pickTeam(el) { openTeamPicker(el.dataset.side); },
  choose(el) { DRAFT[el.dataset.side] = el.dataset.id; closeSheet(); render(); },
  quickTeam(el) { closeSheet(); SHEET_RETURN = el.dataset.side; openTeamEditor(null); },
  create() { createGame(); },
  /* invite and join */
  useRole(el) {
    const r = el.dataset.role;
    if (r === 'display') { G.role = 'display'; if (G.link) { G.link.o.role = 'display'; G.link.hello(); } go('display'); return; }
    G.role = 'controller'; G.preview = r === 'both' ? true : G.preview; Store.set('preview', G.preview);
    go('control');
  },
  joinRole(el) { ROUTE.role = el.dataset.role; ROUTE.code = ($('#join-code') || {}).value || ROUTE.code; render(); },
  doJoin() { startJoin(($('#join-code') || {}).value, ROUTE.role || 'controller'); },
  cancelJoin() { if (G.waitingJoin) closeGame(true); go('home'); },
  pinOk() {
    const w = G.waitingJoin; if (!w || !G.game) return closeSheet();
    if (($('#pin-in').value || '') === G.game.pin) { w.pinOk = true; closeSheet(); finishJoin(); }
    else { toast('That PIN does not match.', 'alert'); $('#pin-in').value = ''; $('#pin-in').focus(); }
  },
  viewerInstead() { const w = G.waitingJoin; if (!w) return; w.role = 'viewer'; w.pinOk = true; closeSheet(); finishJoin(); },
  /* controller */
  ev(el) {
    let p = {}; try { p = JSON.parse(el.dataset.p || '{}'); } catch (e) {}
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 160);
    dispatch(el.dataset.t, p);
  },
  clock(el) {
    const k = el.dataset.k || 'game', c = G.R.S.clocks[k]; if (!c) return;
    dispatch('clock', { k: k, a: c.run ? 'stop' : 'start' });
  },
  clockQuick(el) { const k = el.dataset.k; if (k === 'brk' && +el.dataset.ms === 0) return dispatch('clock', { k: k, a: 'set', ms: 0 }); dispatch('clock', { k: k, a: 'set', ms: +el.dataset.ms, run: el.dataset.run ? true : undefined }); },
  clockset(el) { openClockSheet(el.dataset.k || 'game'); },
  adj(el) { dispatch('clock', { k: el.dataset.k || 'game', a: 'adj', d: +el.dataset.d }); },
  keypad(el) { openKeypad(el.dataset.mode, el.dataset.side, el.dataset.color); },
  undo() { const t = E.undoTarget(G.R.log); if (!t) return; dispatch('undo', { target: t.ev.id }); toast('Undone: ' + t.desc); },
  undoOne(el) { dispatch('undo', { target: el.dataset.id }); },
  restore(el) {
    const u = G.R.log.slice().reverse().find(e => e.isUndo && !e.cancelled && e.ev.p.target === el.dataset.id);
    if (u) dispatch('undo', { target: u.ev.id });
  },
  step(el) { stepAction(el.dataset.id); },
  soFirst(el) { closeSheet(); dispatch('so', { first: el.dataset.side }); },
  log() { openLog(); },
  menu() { openMenu(); },
  invite() { openInviteSheet(); },
  corrections() { openCorrections(); },
  boardSettings() { openBoardSettings(); },
  setRole(el) { G.role = el.dataset.role; if (G.link) { G.link.o.role = G.role; G.link.hello(); } Store.set('active', { id: G.game.id, role: G.role }); closeSheet(); render(); },
  endGame() { closeSheet(); dispatch('final'); },
  togglePreview() { G.preview = !G.preview; Store.set('preview', G.preview); render(); },
  openDisplay() { go('display'); },
  backToCtl() { go('control'); },
  leave() { closeGame(false); go('home'); },
  summaryCur() { closeSheet(); go('summary', { id: G.game.id, from: 'control' }); },
  copyCsv() { copyText(csvOf(G.game, G.R.log), 'Log copied as CSV'); },
  saveCsv() { saveFile('scoreboard-' + G.game.code + '-log.csv', csvOf(G.game, G.R.log), 'text/csv'); },
  copy(el) { copyText(el.dataset.text, 'Link copied'); },
  /* display */
  fullscreen() { const d = document.documentElement; try { (d.requestFullscreen || d.webkitRequestFullscreen).call(d).catch(() => {}); } catch (e) { toast('Full screen is not available here.'); } },
  toggleJoin() { G.showJoin = !G.showJoin; paintDisplay(); },
  /* teams and history */
  editTeam(el) { openTeamEditor(el.dataset.id || null); },
  openSummary(el) { go('summary', { id: el.dataset.id, from: 'history' }); },
  copySummary(el) { const rec = loadGame(el.dataset.id); const g = sanitizeGame(rec.game); copyText(summaryText(g, E.replay(g, rec.events || []).S), 'Summary copied'); },
  copyCsvFor(el) { const rec = loadGame(el.dataset.id); const g = sanitizeGame(rec.game); copyText(csvOf(g, E.replay(g, rec.events || []).log), 'Log copied as CSV'); },
  saveCsvFor(el) { const rec = loadGame(el.dataset.id); const g = sanitizeGame(rec.game); saveFile('scoreboard-' + g.code + '-log.csv', csvOf(g, E.replay(g, rec.events || []).log), 'text/csv'); },
  deleteGame(el) {
    const id = el.dataset.id;
    if (G.game && G.game.id === id) closeGame(false);
    Store.del('game.' + id); Store.set('games', Store.get('games', []).filter(x => x.id !== id));
    const a = Store.get('active'); if (a && a.id === id) Store.set('active', null);
    toast('Game deleted'); go('history');
  },
};
function setOv(k, v) {
  const pr = E.SPORTS[DRAFT.sport].presets.find(p => p.id === DRAFT.presetId) || E.SPORTS[DRAFT.sport].presets[0];
  if (String(pr.rules[k]) === String(v)) delete DRAFT.ov[k]; else DRAFT.ov[k] = v;
  draftGameCache = null;
}

/* ============================================================== events */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.hasAttribute('data-hold')) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
/* Hold-to-confirm for destructive actions. */
let holdT = null, holdEl = null;
function holdStart(el) {
  holdCancel();
  holdEl = el;
  const ms = +el.dataset.hold || 900;
  el.style.setProperty('--hold', ms + 'ms');
  el.classList.add('holding');
  holdT = setTimeout(() => { const t = holdEl; holdCancel(); if (t && ACT[t.dataset.act]) { haptic(); ACT[t.dataset.act](t); } }, ms);
}
function holdCancel() { clearTimeout(holdT); holdT = null; if (holdEl) holdEl.classList.remove('holding'); holdEl = null; }
document.addEventListener('pointerdown', e => { const el = e.target.closest('[data-hold]'); if (el && !el.disabled) { holdStart(el); } });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, e => { if (holdEl && (t !== 'pointerleave' || e.target === holdEl)) holdCancel(); }, true));
document.addEventListener('keydown', e => {
  const el = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && el && el.hasAttribute && el.hasAttribute('data-hold') && !e.repeat) { e.preventDefault(); holdStart(el); return; }
  if (e.key === 'Escape' && SHEET) { closeSheet(); return; }
  if (ROUTE.v === 'control' && !SHEET && G.game && G.role !== 'viewer') {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ' && G.R.S.clocks.game && !(el && el.tagName === 'BUTTON')) { e.preventDefault(); ACT.clock({ dataset: { k: 'game' } }); }
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ACT.undo(); }
  }
  if (ROUTE.v === 'display' && (e.key === 'f' || e.key === 'F')) ACT.fullscreen();
});
document.addEventListener('keyup', e => { if ((e.key === 'Enter' || e.key === ' ') && holdEl) holdCancel(); });
document.addEventListener('input', e => {
  const t = e.target;
  if (ROUTE.v !== 'setup' || !DRAFT) return;
  if (t.dataset.ov) {
    let v = t.value;
    if (t.type === 'number') {
      const f = E.SPORTS[DRAFT.sport].fields.find(x => x.k === t.dataset.ov);
      if (t.value === '' || !f) return;
      v = clampInt(t.value, f.min, f.max, f.min);
    }
    setOv(t.dataset.ov, v); refreshPreview(); return;
  }
  if (t.id === 'd-venue') { DRAFT.venue = t.value; draftGameCache = null; refreshPreview(); }
  if (t.id === 'd-start') { DRAFT.start = t.value; draftGameCache = null; refreshPreview(); }
  if (t.id === 'd-pin') { DRAFT.pin = t.value.replace(/\D/g, '').slice(0, 6); }
  if (t.id === 'd-w' || t.id === 'd-h') { DRAFT.display[t.id === 'd-w' ? 'w' : 'h'] = clampInt(t.value, 32, 7680, DRAFT.display[t.id === 'd-w' ? 'w' : 'h']); draftGameCache = null; refreshPreview(); }
  if (t.id === 'd-safe') { DRAFT.display.safe = clampInt(t.value, 0, 12, 3); const v = $('#safe-v'); if (v) v.textContent = DRAFT.display.safe + '%'; draftGameCache = null; refreshPreview(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (ROUTE.v === 'setup' && DRAFT) {
    if (t.dataset.ov && t.tagName === 'SELECT') { setOv(t.dataset.ov, t.value); render(); }
    else if (t.dataset.ov) render();
    if (t.id === 'd-font') { DRAFT.display.font = t.value; draftGameCache = null; refreshPreview(); }
    if (t.id === 'd-w' || t.id === 'd-h') render();
  }
  if (t.id === 'join-code') { t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); ROUTE.code = t.value; }
});
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'join-code' && e.key === 'Enter') ACT.doJoin(); });
document.addEventListener('pointermove', () => { if (ROUTE.v === 'display') wakeUI(); }, { passive: true });
document.addEventListener('pointerdown', () => { if (ROUTE.v === 'display') wakeUI(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ROUTE.v === 'display') requestWake(); if (!document.hidden && G.link) G.link.hello(); });
window.addEventListener('resize', () => { $$('[data-board]').forEach(fitStage); });
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (ROUTE.v === 'home') render(); });

/* ================================================================ boot */
function boot() {
  const hash = (location.hash || '').replace(/^#/, '');
  const mJoin = /^join-([A-Za-z0-9]{6})$/.exec(hash), mDisp = /^display-([A-Za-z0-9]{6})$/.exec(hash);
  const active = Store.get('active');
  if (mDisp) startJoin(mDisp[1], 'display');
  else if (mJoin) { ROUTE = { v: 'join', code: mJoin[1].toUpperCase(), role: 'controller' }; render(true); }
  else if (active && active.id && active.role && loadGame(active.id)) openGame(active.id, active.role, active.role === 'display' ? 'display' : 'control');
  else render(true);
  requestAnimationFrame(tick);
  if (!IN_ARTIFACT && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('An update is ready. Reload to use it.', 'warn'); });
      });
    }).catch(() => {});
  }
}

window.__sb = { G: G, E: E, dispatch: dispatch, go: go, Store: Store, startJoin: startJoin };
boot();
})();
