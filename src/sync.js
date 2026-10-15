/* screenRIG Scoreboard · device sync
 *
 * Every device keeps the whole event log. Logs merge by event id, so
 * commutative actions (points, fouls) always apply, and state-setting
 * actions (set clock) resolve by timestamp order: last writer wins.
 *
 * Transports are interchangeable and can run side by side:
 *   bc    BroadcastChannel: other windows of this browser
 *   room  other signed-in viewers of the Claude-hosted page
 *   p2p   WebRTC via the public PeerJS broker (installed PWA)
 *
 * Anti-entropy: every heartbeat carries a version vector (highest
 * contiguous event number per client). Peers answer with what the
 * other side lacks, so actions queued offline replay on reconnect.
 */
(function (root) {
'use strict';

const IN_ARTIFACT = !!(root.claude && typeof root.claude.use === 'function');
const HEARTBEAT = 4000, PRESENT_MS = 13000;

/* ------------------------------------------------------------ transports */
function bcTransport(code, onMsg) {
  if (typeof BroadcastChannel === 'undefined') return null;
  let ch;
  try { ch = new BroadcastChannel('screenrig-sb-' + code); } catch (e) { return null; }
  ch.onmessage = e => onMsg(e.data, { via: 'bc' });
  return { name: 'bc', max: 1e9, raw: m => { try { ch.postMessage(m); } catch (e) {} }, close: () => { try { ch.close(); } catch (e) {} }, up: () => true };
}

async function roomTransport(code, onMsg, hooks) {
  let r0 = null;
  try { r0 = await root.claude.use('room'); } catch (e) { r0 = null; }
  if (!r0) return null;
  let room;
  try { room = await r0.join('sb-' + code.toLowerCase()); } catch (e) { return null; }
  const q = [];
  let draining = false;
  const drain = () => {
    if (draining) return;
    draining = true;
    const step = () => {
      const m = q.shift();
      if (!m) { draining = false; return; }
      if (room.connected()) room.emit('sb', m).catch(() => {});
      setTimeout(step, 40);           // stay well under the room's message budget
    };
    step();
  };
  const offs = [];
  try {
    offs.push(room.on('sb', msg => { if (!msg.sameTab) onMsg(msg.data, { via: 'room', peer: msg.peer }); }, () => hooks.onStatus()));
    offs.push(room.onPeers(ch => { if (ch.joined.some(p => !p.sameTab)) hooks.onJoin(); }));
    offs.push(room.onConnection(c => { hooks.onStatus(); if (c) hooks.onUp(); }, () => hooks.onStatus()));
  } catch (e) { return null; }
  return {
    name: 'room', max: 2400,
    raw: m => { if (q.length > 400) q.splice(0, q.length - 400); q.push(m); drain(); },
    close: () => { offs.forEach(f => { try { f(); } catch (e) {} }); room.leave().catch(() => {}); },
    up: () => { try { return room.connected(); } catch (e) { return false; } },
  };
}

let peerLib = null;
function loadPeerJS() {
  if (root.Peer) return Promise.resolve(true);
  if (peerLib) return peerLib;
  peerLib = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => res(!!root.Peer);
    s.onerror = () => res(false);
    document.head.appendChild(s);
    setTimeout(() => res(!!root.Peer), 12000);
  });
  return peerLib;
}

/* Hub-and-spoke WebRTC. The first device to claim the game's hub id relays
   for everyone; if the hub disappears, a spoke takes the id over. */
async function p2pTransport(code, onMsg, hooks) {
  if (!(await loadPeerJS())) return null;
  const hubId = 'screenrig-sb-' + code.toLowerCase();
  const conns = new Map();
  let peer = null, isHub = false, closed = false, retry = null, attempts = 0, hubConn = null;

  function wire(c) {
    c.on('open', () => { conns.set(c.connectionId, c); attempts = 0; hooks.onUp(); hooks.onStatus(); });
    c.on('data', d => {
      if (isHub) conns.forEach(o => { if (o !== c && o.open) { try { o.send(d); } catch (e) {} } });
      onMsg(d, { via: 'p2p' });
    });
    c.on('close', () => { conns.delete(c.connectionId); hooks.onStatus(); if (!isHub && c === hubConn) later(); });
    c.on('error', () => {});
  }
  function later() {
    if (closed || retry) return;
    const wait = Math.min(15000, 1200 * Math.pow(1.6, attempts++));
    retry = setTimeout(() => { retry = null; boot(); }, wait);
    hooks.onStatus();
  }
  function destroy() { try { if (peer) peer.destroy(); } catch (e) {} peer = null; conns.clear(); isHub = false; hubConn = null; }
  function asClient() {
    destroy();
    const p = peer = new root.Peer({ debug: 0 });
    p.on('open', () => { if (p !== peer) return; hubConn = p.connect(hubId, { reliable: true, serialization: 'json' }); wire(hubConn); });
    p.on('error', () => { if (p === peer) later(); });
    p.on('disconnected', () => { if (p === peer && !closed) { try { p.reconnect(); } catch (e) {} } });
  }
  function boot() {
    if (closed) return;
    destroy();
    const p = peer = new root.Peer(hubId, { debug: 0 });
    p.on('open', () => { if (p !== peer) return; isHub = true; hooks.onStatus(); });
    p.on('connection', c => wire(c));
    p.on('error', err => {
      if (p !== peer || closed) return;
      if (err && err.type === 'unavailable-id') asClient();
      else later();
    });
    p.on('disconnected', () => { if (p === peer && !closed && isHub) { try { p.reconnect(); } catch (e) {} } });
  }
  boot();
  return {
    name: 'p2p', max: 48000,
    raw: m => conns.forEach(c => { if (c.open) { try { c.send(m); } catch (e) {} } }),
    close: () => { closed = true; clearTimeout(retry); conns.forEach(c => { try { c.close(); } catch (e) {} }); destroy(); },
    up: () => { for (const c of conns.values()) if (c.open) return true; return false; },
    hub: () => isHub,
  };
}

/* ------------------------------------------------------------- the link */
function validEv(e) {
  return e && typeof e === 'object' && typeof e.id === 'string' && e.id.length < 64 && typeof e.c === 'string' && e.c.length < 32 &&
    Number.isInteger(e.n) && e.n > 0 && Number.isFinite(e.at) && typeof e.t === 'string' && e.t.length < 16 &&
    (e.p == null || typeof e.p === 'object') && e.id === e.c + '.' + e.n;
}

class Link {
  constructor(o) {
    this.o = o;
    this.code = o.code; this.cid = o.cid; this.dev = o.dev;
    this.peers = {};
    this.transports = [];
    this.offset = o.offset || 0;
    this.samples = [];
    this.parts = new Map();
    this.closed = false;
    this.remote = IN_ARTIFACT ? 'room' : (o.p2p === false ? null : 'p2p');
    this.remoteState = this.remote ? 'starting' : 'none';
    this.hs = null;
  }
  start() {
    const onMsg = (m, meta) => { try { this.recv(m, meta); } catch (e) { /* ignore malformed */ } };
    const hooks = { onJoin: () => this.onJoin(), onStatus: () => this.emitStatus(), onUp: () => this.hello() };
    const bc = bcTransport(this.code, onMsg);
    if (bc) this.add(bc);
    if (this.remote === 'room' || this.remote === 'p2p') {
      const make = this.remote === 'room' ? roomTransport : p2pTransport;
      make(this.code, onMsg, hooks).then(t => {
        if (!t) { this.remoteState = 'unavailable'; this.emitStatus(); return; }
        if (this.closed) { t.close(); return; }
        this.add(t); this.remoteState = 'on'; this.hello(); this.emitStatus();
      }).catch(() => { this.remoteState = 'unavailable'; this.emitStatus(); });
    }
    this.hello();
    this.timer = setInterval(() => this.beat(), HEARTBEAT);
    this.onLine = () => { this.hello(); this.emitStatus(); };
    if (root.addEventListener) { root.addEventListener('online', this.onLine); root.addEventListener('offline', this.onLine); }
    this.emitStatus();
    return this;
  }
  stop() {
    if (this.closed) return;
    try { this.send({ k: 'bye' }); } catch (e) {}
    this.closed = true;
    clearInterval(this.timer); clearTimeout(this.hs);
    if (root.removeEventListener) { root.removeEventListener('online', this.onLine); root.removeEventListener('offline', this.onLine); }
    this.transports.forEach(t => t.close());
    this.transports = [];
  }
  add(t) {
    const max = t.max;
    t.send = msg => {
      const s = JSON.stringify(msg);
      if (s.length <= max) return t.raw(msg);
      const id = Math.random().toString(36).slice(2, 10), n = Math.ceil(s.length / max);
      for (let i = 0; i < n; i++) t.raw({ k: 'part', g: msg.g, f: msg.f, id: id, i: i, n: n, d: s.slice(i * max, (i + 1) * max) });
    };
    this.transports.push(t);
  }
  send(m) {
    if (this.closed) return;
    m.g = this.code; m.f = this.cid; m.v = 1;
    this.transports.forEach(t => { try { t.send(m); } catch (e) {} });
  }
  joinPart(m) {
    if (typeof m.id !== 'string' || !Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n > 500 || typeof m.d !== 'string') return null;
    let p = this.parts.get(m.id);
    if (!p) { p = { n: m.n, got: new Array(m.n), count: 0, t: Date.now() }; this.parts.set(m.id, p); }
    if (p.got[m.i] == null) { p.got[m.i] = m.d; p.count++; }
    if (p.count < p.n) return null;
    this.parts.delete(m.id);
    try { return JSON.parse(p.got.join('')); } catch (e) { return null; }
  }
  vec() {
    const by = {};
    this.o.getEvents().forEach(e => { (by[e.c] = by[e.c] || []).push(e.n); });
    const v = {};
    Object.keys(by).forEach(c => {
      const ns = by[c].sort((a, b) => a - b);
      let k = 0;
      for (const n of ns) { if (n === k + 1) k = n; else if (n > k + 1) break; }
      v[c] = k;
    });
    return v;
  }
  hello() {
    if (this.closed) return;
    const g = this.o.getGame();
    this.send({ k: 'hi', role: this.o.role, name: this.o.name, dev: this.dev, vec: this.vec(), rev: g ? g.rev : 0, has: !!g });
  }
  helloSoon() { if (this.hs) return; this.hs = setTimeout(() => { this.hs = null; this.hello(); }, 120 + Math.random() * 200); }
  beat() {
    this.hello();
    const cut = Date.now() - 30000;
    this.parts.forEach((p, id) => { if (p.t < cut) this.parts.delete(id); });
    this.syncTime();
    this.emitStatus();
  }
  onJoin() {
    // Someone opened this game. Say hello, and push what we have in case
    // they can only listen (a view-only display never says hello itself).
    setTimeout(() => {
      this.hello();
      const g = this.o.getGame();
      if (g) { this.send({ k: 'def', game: g }); this.sendEvents(this.o.getEvents().filter(e => e.c === this.cid || !this.present(e.c))); }
    }, 150 + Math.random() * 450);
  }
  sendEvents(evs) { for (let i = 0; i < evs.length; i += 30) this.send({ k: 'ev', evs: evs.slice(i, i + 30) }); }
  present(cid) { const p = this.peers[cid]; return !!(p && Date.now() - p.last < PRESENT_MS); }
  recv(m, meta) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'part') { if (m.f === this.cid) return; const full = this.joinPart(m); if (full) this.recv(full, meta); return; }
    if (m.g !== this.code || m.f === this.cid || typeof m.f !== 'string') return;
    switch (m.k) {
      case 'hi': this.seen(m, false); this.answer(m); break;
      case 'def': this.seen(m, true); if (m.game && typeof m.game === 'object') this.o.onDef(m.game, m.f); break;
      case 'ev': this.seen(m, true); if (Array.isArray(m.evs)) { const ok = m.evs.filter(validEv); if (ok.length) this.o.onEvents(ok, m.f); } break;
      case 'ping': if (m.to === this.dev) this.send({ k: 'pong', to: m.f, t0: m.t0, t1: Date.now() }); break;
      case 'pong': if (m.to === this.cid) this.pong(m); break;
      case 'bye': delete this.peers[m.f]; this.emitStatus(); break;
    }
  }
  seen(m, weak) {
    const fresh = !this.peers[m.f];
    const p = this.peers[m.f] || (this.peers[m.f] = { cid: m.f, vec: {} });
    if (!weak) {
      p.role = String(m.role || '').slice(0, 12);
      p.name = String(m.name || 'Device').slice(0, 40);
      p.dev = String(m.dev || '').slice(0, 40);
      p.vec = m.vec && typeof m.vec === 'object' ? m.vec : {};
    }
    p.last = Date.now();
    const g = this.o.getGame();
    if (fresh && g && p.dev && p.dev === g.timebase) this.syncTime();
    if (fresh) this.emitStatus();
  }
  answer(m) {
    const g = this.o.getGame();
    const v = m.vec && typeof m.vec === 'object' ? m.vec : {};
    if (g) {
      if (!m.has || (m.rev || 0) < g.rev) this.send({ k: 'def', game: g });
      const missing = this.o.getEvents().filter(e => e.n > (v[e.c] || 0) && (e.c === this.cid || !this.present(e.c)));
      if (missing.length) this.sendEvents(missing);
    }
    const mine = this.vec();
    if (Object.keys(v).some(c => (v[c] || 0) > (mine[c] || 0)) || (m.has && !g) || (g && (m.rev || 0) > g.rev)) this.helloSoon();
  }
  syncTime() {
    const g = this.o.getGame();
    if (!g || !g.timebase || g.timebase === this.dev) { if (g && g.timebase === this.dev) this.offset = 0; return; }
    const there = Object.keys(this.peers).some(c => this.peers[c].dev === g.timebase && this.present(c));
    if (there) this.send({ k: 'ping', to: g.timebase, t0: Date.now() });
  }
  pong(m) {
    const now = Date.now(), rtt = now - m.t0;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 3000 || !Number.isFinite(m.t1)) return;
    this.samples.push({ rtt: rtt, off: m.t1 - (m.t0 + rtt / 2) });
    if (this.samples.length > 8) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    if (Math.abs(best.off - this.offset) > 10) { this.offset = best.off; if (this.o.onOffset) this.o.onOffset(this.offset); }
  }
  now() { return Date.now() + this.offset; }
  status() {
    const t = Date.now();
    const peers = Object.keys(this.peers).map(c => this.peers[c]);
    const present = peers.filter(p => t - p.last < PRESENT_MS);
    const myMax = this.o.getEvents().reduce((m, e) => (e.c === this.cid && e.n > m ? e.n : m), 0);
    const acked = peers.reduce((m, p) => Math.max(m, (p.vec && p.vec[this.cid]) || 0), 0);
    const remoteUp = this.transports.some(x => x.name !== 'bc' && x.up());
    return {
      present: present.map(p => ({ cid: p.cid, name: p.name, role: p.role, dev: p.dev })),
      ever: peers.length > 0,
      remote: this.remote, remoteState: this.remoteState, remoteUp: remoteUp,
      online: typeof navigator === 'undefined' || navigator.onLine !== false,
      queued: peers.length ? Math.max(0, myMax - acked) : 0,
      synced: this.samples.length > 0,
      hub: this.transports.some(x => x.hub && x.hub()),
    };
  }
  emitStatus() { if (this.o.onStatus && !this.closed) this.o.onStatus(this.status()); }
}

const api = { Link: Link, IN_ARTIFACT: IN_ARTIFACT, validEv: validEv, PRESENT_MS: PRESENT_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.SBSync = api;
})(typeof self !== 'undefined' ? self : this);
