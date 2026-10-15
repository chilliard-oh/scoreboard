/* Sync protocol test: two links in one process over BroadcastChannel. node test/sync.test.js */
const E = require('../src/engine.js');
const { Link } = require('../src/sync.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (v, m) => { if (v) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));

function device(name, dev, game) {
  const d = { name, game, events: [], cid: name.toLowerCase() + Math.random().toString(36).slice(2, 5), defs: 0 };
  d.make = () => {
    d.link = new Link({
      code: 'SYNC01', cid: d.cid, dev, name, role: 'controller',
      getGame: () => d.game, getEvents: () => d.events,
      onDef: g => { d.defs++; if (!d.game || g.rev > d.game.rev) d.game = g; },
      onEvents: evs => { const have = new Set(d.events.map(e => e.id)); evs.forEach(e => { if (!have.has(e.id)) d.events.push(e); }); },
      onStatus: () => {},
    }).start();
  };
  d.act = (t, p) => { const n = d.events.filter(e => e.c === d.cid).reduce((m, e) => Math.max(m, e.n), 0) + 1; const ev = { id: d.cid + '.' + n, c: d.cid, n, at: Date.now(), t, p }; d.events.push(ev); if (d.link) d.link.sendEvents([ev]); return ev; };
  d.state = () => E.replay(d.game, d.events).S;
  return d;
}

(async () => {
  const game = E.newGame({ sport: 'basketball', presetId: 'nfhs', code: 'SYNC01', timebase: 'devA', home: { name: 'Home', short: 'HOM', c1: '#112233', c2: '#ffffff' }, away: { name: 'Away', short: 'AWY', c1: '#aa3322', c2: '#ffffff' } });
  const A = device('A', 'devA', game), B = device('B', 'devB', null);
  A.make();
  A.act('score', { side: 'home', pts: 3 });
  A.act('foul', { side: 'away', player: '12' });
  B.make();
  await sleep(600);
  ok(B.game && B.game.code === 'SYNC01', 'joiner receives the game definition');
  eq(B.events.length, 2, 'joiner receives existing events');
  eq(B.state().score, { home: 3, away: 0 }, 'joiner replays to the same state');
  A.act('score', { side: 'away', pts: 2 });
  await sleep(150);
  eq(B.state().score, { home: 3, away: 2 }, 'live event reaches the other device');
  B.act('score', { side: 'home', pts: 1 });
  await sleep(150);
  eq(A.state().score, { home: 4, away: 2 }, 'events flow both ways');

  // B drops off, keeps scoring, then comes back
  B.link.stop(); B.link = null;
  await sleep(50);
  B.act('score', { side: 'away', pts: 3 });
  B.act('timeout', { side: 'away', kind: 'full' });
  A.act('score', { side: 'home', pts: 2 });
  await sleep(100);
  eq(A.state().score, { home: 6, away: 2 }, 'while apart, A only has its own action');
  eq(B.state().score, { home: 4, away: 5 }, 'while apart, B only has its own actions');
  B.make();
  await sleep(1200);
  eq(A.state().score, { home: 6, away: 5 }, 'queued actions replay on reconnect');
  eq(B.state().score, { home: 6, away: 5 }, 'reconnected device catches up');
  eq(A.events.length, B.events.length, 'logs converge');
  eq(JSON.stringify(A.state().tol), JSON.stringify(B.state().tol), 'derived state converges');

  // a third device that arrives late gets everything, including B's offline actions
  const C = device('C', 'devC', null);
  C.make();
  await sleep(1200);
  eq(C.state().score, { home: 6, away: 5 }, 'late joiner gets the full log');
  // definition edits propagate (LWW by rev)
  A.game = Object.assign({}, A.game, { rev: A.game.rev + 1, display: { aspect: 'ribbon' } });
  A.link.send({ k: 'def', game: A.game });
  await sleep(200);
  eq(B.game.display.aspect, 'ribbon', 'board settings reach other devices');
  // time sync to the timebase device
  B.link.syncTime();
  await sleep(200);
  ok(B.link.samples.length > 0 && Math.abs(B.link.offset) < 50, 'clock offset measured against the timebase device');
  const st = B.link.status();
  ok(st.present.length >= 2, 'presence lists the other devices');
  [A, B, C].forEach(d => d.link && d.link.stop());
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
