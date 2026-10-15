/* Engine tests: run with `node test/engine.test.js` */
const E = require('../src/engine.js');
let pass = 0, fail = 0;
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++; else { fail++; console.log('  ✗ ' + msg + '\n     expected ' + JSON.stringify(b) + '\n     got      ' + JSON.stringify(a)); }
}
function ok(v, msg) { eq(!!v, true, msg); }
const home = { name: 'Ridgeview Ravens', short: 'RVR', c1: '#1d2a5b', c2: '#f2b632' };
const away = { name: 'Lakeside Otters', short: 'LKO', c1: '#0f7c86', c2: '#e8d8b0' };

function harness(sport, presetId, overrides) {
  const game = E.newGame({ sport, presetId, home, away, overrides, code: 'TEST01', now: 0 });
  const evs = [];
  let T = 1_000_000, n = 0;
  const h = {
    game, evs,
    at: () => T,
    wait: ms => { T += ms; return h; },
    do: (t, p, opt) => { opt = opt || {}; const c = opt.c || 'A'; const e = { id: c + '.' + (++n), c, n, at: opt.at != null ? opt.at : (T += (opt.dt != null ? opt.dt : 10)), t, p: p || {} }; evs.push(e); return e; },
    run: () => E.replay(game, evs),
    S: () => E.replay(game, evs).S,
    last: () => { const r = E.replay(game, evs); return r.log[r.log.length - 1]; },
    clock: (k) => { const S = E.replay(game, evs).S; return E.clockValue(S, k || 'game', T); },
  };
  return h;
}
const section = name => console.log('• ' + name);

/* ---------------------------------------------------------------- basketball */
section('basketball · NFHS');
{
  const h = harness('basketball', 'nfhs');
  eq(h.S().phase, 'pre', 'starts in pregame');
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  eq(h.S().phase, 'live', 'clock start begins the game');
  h.wait(10_000);
  eq(h.clock(), 8 * 60000 - 10_000, 'game clock counts down from timestamp');
  eq(h.clock('shot'), 25_000, 'shot clock linked to game clock');
  h.do('clock', { k: 'game', a: 'stop' }, { dt: 0 });
  h.wait(5000);
  eq(h.clock(), 8 * 60000 - 10_000, 'stopped clock holds');
  eq(h.clock('shot'), 25_000, 'shot clock stops with game clock');
  h.do('clock', { k: 'shot', a: 'set', ms: 35000 });
  eq(h.clock('shot'), 35000, 'shot clock reset');
  h.do('score', { side: 'home', pts: 2 });
  h.do('score', { side: 'home', pts: 3 });
  h.do('score', { side: 'away', pts: 1 });
  eq(h.S().score, { home: 5, away: 1 }, 'scores add');
  eq(h.S().byPeriod.home, [5], 'score by period');
  for (let i = 0; i < 4; i++) h.do('foul', { side: 'away' });
  eq(E.SPORTS.basketball.bonus(h.S(), h.game.rules, 'home'), 0, 'no bonus at 4 fouls');
  h.do('foul', { side: 'away', player: '12' });
  eq(E.SPORTS.basketball.bonus(h.S(), h.game.rules, 'home'), 1, 'bonus on 5th team foul per quarter');
  ok(/RVR in the bonus/.test(h.last().note), 'bonus note');
  for (let i = 0; i < 4; i++) h.do('foul', { side: 'home', player: '23' });
  ok(/has 4 fouls/.test(h.last().note), 'warning one before foul out');
  h.do('foul', { side: 'home', player: '23' });
  eq(h.S().out.home, ['23'], 'player fouls out at 5');
  ok(h.last().alert, 'foul out is an alert');
  // timeouts
  h.do('clock', { k: 'game', a: 'start' });
  h.wait(3000);
  h.do('timeout', { side: 'home', kind: 'full' }, { dt: 0 });
  eq(h.S().clocks.game.run, false, 'timeout stops the clock');
  h.do('timeout', { side: 'home', kind: 'full' });
  h.do('timeout', { side: 'home', kind: 'full' });
  h.do('timeout', { side: 'home', kind: 'full' });
  ok(/no full timeouts/.test(h.last().rej), 'fourth full timeout rejected');
  eq(h.S().tol.home, { full: 0, short: 2 }, 'timeouts left');
  // undo and restore
  const e = h.do('score', { side: 'away', pts: 3 });
  eq(h.S().score.away, 4, 'before undo');
  const u = h.do('undo', { target: e.id });
  eq(h.S().score.away, 1, 'undo removes the 3');
  eq(h.last().desc, 'Undo: +3 LKO', 'undo described');
  h.do('undo', { target: u.id });
  eq(h.S().score.away, 4, 'undoing the undo restores');
  const r = h.run();
  eq(E.undoTarget(r.log).desc, '+3 LKO', 'next undo target is the restored action');
  // period transitions
  h.do('clock', { k: 'game', a: 'set', ms: 0 });
  h.do('endp');
  eq(h.S().phase, 'break', 'end of period -> break');
  eq(E.breakTitle(h.game, h.S()), 'End of 1st quarter', 'break title');
  h.do('score', { side: 'home', pts: 1 });
  eq(h.S().score.home, 6, 'free throw after period end still counts');
  h.do('nextp');
  const S2 = h.S();
  eq([S2.period, S2.phase, S2.fouls.home, S2.fouls.away], [2, 'live', 0, 0], 'Q2 resets team fouls');
  eq(S2.clocks.game.ms, 8 * 60000, 'Q2 clock reset');
  eq(S2.pf.home['23'], 5, 'player fouls carry');
  h.do('clock', { k: 'game', a: 'set', ms: 0 });
  h.do('endp');
  eq(E.breakTitle(h.game, h.S()), 'Halftime', 'halftime after Q2');
  ok(h.S().clocks.brk && h.S().clocks.brk.run, 'halftime countdown runs');
  h.do('nextp'); h.do('clock', { k: 'game', a: 'set', ms: 0 }); h.do('endp');
  h.do('nextp');
  // tie it up at end of Q4
  const S4 = h.S();
  const d = S4.score.home - S4.score.away;
  h.do('score', { side: d > 0 ? 'away' : 'home', pts: 1 });
  for (let i = 1; i < Math.abs(d); i++) h.do('score', { side: d > 0 ? 'away' : 'home', pts: 1 });
  h.do('clock', { k: 'game', a: 'set', ms: 0 }); h.do('endp');
  const S5 = h.S();
  eq([S5.tie, S5.decided], [true, null], 'tie detected at end of regulation');
  eq(E.nextSteps(h.game, S5).map(s => s.id), ['next', 'final'], 'offers overtime');
  eq(E.nextSteps(h.game, S5)[0].label, 'Start overtime', 'overtime label');
  h.do('nextp');
  const S6 = h.S();
  eq([S6.period, S6.clocks.game.ms], [5, 4 * 60000], 'OT 4 minutes');
  eq(S6.tol.home.full, 0 + 1, 'OT adds one timeout (carry)');
  eq(E.SPORTS.basketball.label(S6, h.game.rules).short, 'OT', 'OT label');
  h.do('score', { side: 'home', pts: 2 });
  h.do('clock', { k: 'game', a: 'set', ms: 0 }); h.do('endp');
  eq(h.S().decided, 'home', 'decided after OT');
  h.do('final');
  eq([h.S().phase, h.S().winner], ['final', 'home'], 'final');
  h.do('score', { side: 'away', pts: 2 });
  ok(/final/.test(h.last().rej), 'no scoring after final');
  const bm = E.boardModel(h.game, h.S(), h.at());
  eq(bm.status, 'Final · OT', 'final status shows OT');
  eq(bm.breakdown.cols, ['Q1', 'Q2', 'Q3', 'Q4', 'OT'], 'breakdown columns');
}
section('basketball · tenths and shot-clock expiry');
{
  const h = harness('basketball', 'nba');
  h.do('clock', { k: 'game', a: 'set', ms: 30_000 });
  h.do('clock', { k: 'shot', a: 'set', ms: 24_000 });
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  h.wait(29_950);
  const S = h.S();
  eq(E.liveText(h.game, S, 'game', h.at(), { tenths: true }), '0.0', 'tenths at the end');
  eq(E.liveText(h.game, S, 'shot', h.at(), { secs: true }), '0', 'shot clock at zero');
  h.wait(5000);
  eq(E.clockValue(h.S(), 'game', h.at()), 0, 'clock clamps at zero');
  h.do('clock', { k: 'game', a: 'start' });
  eq(h.last().noop || h.last().rej === undefined, true, 'start at zero is a no-op');
  eq(E.fmtClock(61_000, {}), '1:01', 'ceil formatting');
  eq(E.fmtClock(59_999, { tenths: true }), '59.9', 'tenths formatting');
  eq(E.fmtClock(4_250, { secs: true, tenthsUnder: 5000 }), '4.2', 'shot tenths');
}
section('basketball · NCAA men double bonus, NBA OT');
{
  const h = harness('basketball', 'ncaam');
  for (let i = 0; i < 7; i++) h.do('foul', { side: 'away' });
  eq(E.SPORTS.basketball.bonus(h.S(), h.game.rules, 'home'), 1, 'bonus on 7th');
  for (let i = 0; i < 3; i++) h.do('foul', { side: 'away' });
  eq(E.SPORTS.basketball.bonus(h.S(), h.game.rules, 'home'), 2, 'double bonus on 10th');
  h.do('clock', { k: 'game', a: 'set', ms: 0 }); h.do('endp');
  eq(E.breakTitle(h.game, h.S()), 'Halftime', 'halftime after 1st half');
  h.do('nextp');
  eq(h.S().fouls.away, 0, 'fouls reset at the half');
  eq(E.SPORTS.basketball.label(h.S(), h.game.rules).short, '2ND', 'half label');
  const n = harness('basketball', 'nba');
  for (let P = 1; P <= 4; P++) { if (P > 1) n.do('nextp'); for (let i = 0; i < 2; i++) n.do('foul', { side: 'away' }); n.do('clock', { k: 'game', a: 'set', ms: 0 }); n.do('endp'); }
  n.do('nextp');
  eq(n.S().fouls.away, 0, 'NBA overtime has its own team fouls');
  for (let i = 0; i < 4; i++) n.do('foul', { side: 'away' });
  eq(E.SPORTS.basketball.bonus(n.S(), n.game.rules, 'home'), 1, 'NBA OT penalty on 4th foul');
  eq(n.S().tol.home.full, 2, 'NBA OT: 2 timeouts, regulation ones do not carry');
  const f = harness('basketball', 'fiba');
  f.do('timeout', { side: 'home' }); f.do('timeout', { side: 'home' }); f.do('timeout', { side: 'home' });
  ok(f.last().rej, 'FIBA: 2 timeouts in the first half');
  for (let P = 1; P <= 2; P++) { if (P > 1) f.do('nextp'); f.do('clock', { k: 'game', a: 'set', ms: 0 }); f.do('endp'); }
  f.do('nextp');
  eq(f.S().tol.home.full, 3, 'FIBA: 3 timeouts in the second half');
}

/* ---------------------------------------------------------------- volleyball */
section('volleyball · NCAA');
{
  const h = harness('volleyball', 'ncaa');
  const pts = (side, k) => { for (let i = 0; i < k; i++) h.do('score', { side }); };
  pts('home', 24); pts('away', 24);
  eq(h.S().phase, 'live', '24-24 still live');
  pts('home', 1);
  eq(h.S().phase, 'live', '25-24 needs win by two');
  eq(h.S().serve, 'home', 'serve follows the rally winner');
  pts('away', 1); eq(h.S().serve, 'away', 'side out');
  pts('home', 2);
  eq([h.S().phase, h.S().sets.home], ['break', 1], '27-25 wins the set');
  ok(/Set 1 to RVR, 27–25/.test(h.last().note), 'set note');
  pts('away', 1);
  ok(/Set 1 is over/.test(h.last().rej), 'rally rejected between sets');
  h.do('nextp');
  eq([h.S().period, h.S().score.home, h.S().serve], [2, 0, 'away'], 'set 2 starts, first serve alternates');
  for (let s = 0; s < 2; s++) { pts('away', 25); if (s === 0) h.do('nextp'); }
  eq(h.S().sets, { home: 1, away: 2 }, 'sets count');
  h.do('nextp'); pts('home', 25); h.do('nextp');
  eq(h.S().period, 5, 'deciding set');
  pts('away', 1); pts('home', 7);
  eq(h.S().switchNow, false, 'no switch at 7');
  pts('home', 1);
  eq(h.S().switchNow, true, 'switch sides at 8 in the deciding set');
  ok(h.last().alert, 'side switch alert');
  pts('away', 1); eq(h.S().switchNow, false, 'switch prompt clears on next rally');
  pts('home', 7);
  eq([h.S().phase, h.S().decided], ['break', 'home'], 'deciding set to 15 decides the match');
  eq(E.nextSteps(h.game, h.S()).map(s => s.id), ['final'], 'confirm final');
  h.do('final');
  eq(h.S().winner, 'home', 'match winner by sets');
  const bm = E.boardModel(h.game, h.S(), h.at());
  eq(bm.breakdown.tails, { home: [3], away: [2] }, 'sets in breakdown');
}
section('volleyball · rec cap, timeouts, cards');
{
  const h = harness('volleyball', 'rec');
  for (let i = 0; i < 26; i++) { h.do('score', { side: 'home' }); h.do('score', { side: 'away' }); }
  eq(h.S().phase, 'live', '26-26 live');
  h.do('score', { side: 'away' });
  eq([h.S().phase, h.S().sets.away], ['break', 1], 'cap at 27 ends the set');
  h.do('nextp');
  h.do('timeout', { side: 'home' }); h.do('timeout', { side: 'home' });
  ok(/no timeouts left/.test(h.last().rej), 'one timeout per set in rec');
  h.do('card', { side: 'home', color: 'R', player: '7' });
  eq([h.S().score.away, h.S().serve], [1, 'away'], 'red card gives point and serve');
}

/* ------------------------------------------------------------------- soccer */
section('soccer · FIFA');
{
  const h = harness('soccer', 'fifa');
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  h.wait(60_000);
  eq(E.liveText(h.game, h.S(), 'game', h.at(), { offset: 0 }), '1:00', 'clock counts up');
  h.do('card', { side: 'away', color: 'Y', player: '4' });
  h.do('card', { side: 'away', color: 'Y', player: '4' });
  eq([h.S().yellows.away, h.S().reds.away], [2, 1], 'second yellow becomes red');
  ok(/sent off/.test(h.last().note), 'second yellow note');
  h.do('score', { side: 'home' });
  h.do('endp');
  eq(E.breakTitle(h.game, h.S()), 'Halftime', 'halftime');
  h.do('nextp');
  const off = E.SPORTS.soccer.offsetMs(h.game.rules, 2);
  eq(off, 45 * 60000, 'second half display starts at 45:00');
  h.do('score', { side: 'away' });
  h.do('stoppage', { min: 4 });
  eq(h.S().stoppage, 4, 'added time');
  h.do('endp');
  eq(h.S().tie, true, 'tie after regulation');
  eq(E.nextSteps(h.game, h.S()).map(s => s.id), ['next', 'so', 'final'], 'OT, penalties, or tie');
  h.do('nextp'); h.do('endp');
  eq([h.S().tie, h.S().decided], [false, null], 'no decision after first OT period');
  eq(E.nextSteps(h.game, h.S()).map(s => s.id), ['next'], 'must play second OT period');
  h.do('nextp'); h.do('endp');
  eq(E.nextSteps(h.game, h.S()).map(s => s.id), ['so', 'final'], 'after OT: penalties');
  h.do('so', { first: 'home' });
  const kick = (side, made) => h.do('kick', { side, made });
  kick('home', true); kick('away', true); kick('home', true); kick('away', false); kick('home', false); kick('away', true);
  kick('home', true); kick('away', true);
  eq(h.S().so.w, null, '3-3 after four rounds each: undecided');
  kick('home', true);
  eq(h.S().so.w, null, '4-3 with one away kick left is not decided');
  kick('away', false);
  eq(h.S().so.w, 'home', 'away miss decides it');
}
section('soccer · shootout sudden death and golden goal');
{
  const h = harness('soccer', 'fifa');
  h.do('start'); h.do('endp'); h.do('nextp'); h.do('endp'); h.do('nextp'); h.do('endp'); h.do('nextp'); h.do('endp');
  h.do('so', { first: 'away' });
  for (let i = 0; i < 5; i++) { h.do('kick', { side: 'away', made: true }); h.do('kick', { side: 'home', made: true }); }
  eq(h.S().so.w, null, '5-5 goes to sudden death');
  h.do('kick', { side: 'away', made: false }); h.do('kick', { side: 'home', made: true });
  eq(h.S().so.w, 'home', 'sudden death winner');
  h.do('final');
  eq([h.S().winner, h.S().score.home], ['home', 0], 'soccer shootout does not change the score');
  eq(E.boardModel(h.game, h.S(), h.at()).status, 'Final · PK', 'final PK status');
  const g = harness('soccer', 'nfhs');
  g.do('start'); g.do('endp'); g.do('nextp'); g.do('endp'); g.do('nextp');
  g.do('score', { side: 'away' });
  eq([g.S().phase, g.S().decided], ['break', 'away'], 'golden goal ends overtime');
}

/* ----------------------------------------------------------------- football */
section('football · NFHS');
{
  const h = harness('football', 'nfhs');
  h.do('poss', { side: 'home' });
  h.do('score', { side: 'home', kind: 'td' });
  h.do('score', { side: 'home', kind: 'pat' });
  h.do('score', { side: 'away', kind: 'fg' });
  h.do('score', { side: 'away', kind: 'safety' });
  eq(h.S().score, { home: 7, away: 5 }, 'football scoring units');
  h.do('down', { down: 3, dist: 7 });
  eq([h.S().down, h.S().dist], [3, 7], 'down and distance');
  h.do('ball', { side: 'away', yd: 35 });
  eq(E.boardModel(h.game, h.S(), h.at()).strip.items[1].v, 'LKO 35', 'ball on');
  h.do('timeout', { side: 'away' }); h.do('timeout', { side: 'away' }); h.do('timeout', { side: 'away' }); h.do('timeout', { side: 'away' });
  ok(h.last().rej, 'three timeouts per half');
  h.do('endp'); h.do('nextp'); h.do('endp');
  eq(E.breakTitle(h.game, h.S()), 'Halftime', 'football halftime after Q2');
  h.do('nextp');
  eq(h.S().tol.away, 3, 'timeouts reset for the second half');
  for (let i = 0; i < 5; i++) h.do('score', { side: 'home', kind: 'td' });
  ok(!h.S().mercy, 'no running clock below 35');
  h.do('score', { side: 'home', kind: 'td' });
  eq(h.S().mercy, true, 'running clock at 35+ lead in the 2nd half');
  h.do('play', {}); // unknown action
  ok(/Unknown/.test(h.last().rej), 'unknown action rejected');
  h.do('clock', { k: 'play', a: 'set', ms: 25000, run: true });
  eq(h.S().clocks.play.run, true, 'play clock set and run');
}
section('football · Kansas overtime');
{
  const h = harness('football', 'ncaa');
  h.do('start');
  for (let P = 1; P <= 4; P++) { if (P > 1) h.do('nextp'); h.do('endp'); }
  eq(h.S().tie, true, '0-0 tie');
  h.do('nextp');
  eq([h.S().period, !!h.S().clocks.game, h.S().ballOn], [5, false, 25], 'untimed OT from the 25');
  h.do('clock', { k: 'game', a: 'start' });
  ok(h.last().rej, 'no game clock in Kansas OT');
  h.do('endp'); h.do('nextp'); h.do('endp'); h.do('nextp');
  eq([h.S().period, h.S().twoPt], [7, true], 'two-point attempts from the 3rd OT');
  eq(E.SPORTS.football.label(h.S(), h.game.rules).short, '3OT', '3OT label');
}

/* ------------------------------------------------------------------- hockey */
section('hockey · penalties and power plays');
{
  const h = harness('hockey', 'pro');
  const R = h.game.rules, HK = E.SPORTS.hockey;
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  h.wait(5 * 60000);
  const pen = h.do('penalty', { side: 'away', kind: 'minor', player: '12' }, { dt: 0 });
  h.wait(30_000);
  let S = h.S();
  eq(HK.strength(S, R, h.at()), { home: 5, away: 4 }, '5 on 4');
  eq(E.liveText(h.game, S, 'pen:' + pen.id, h.at()), '1:30', 'penalty clock counts with game clock');
  h.do('clock', { k: 'game', a: 'stop' }, { dt: 0 });
  h.wait(60_000);
  eq(E.liveText(h.game, h.S(), 'pen:' + pen.id, h.at()), '1:30', 'penalty clock stops with game clock');
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  h.wait(10_000);
  h.do('score', { side: 'home' }, { dt: 0 });
  ok(/released/.test(h.last().note), 'power-play goal releases the minor');
  eq(HK.strength(h.S(), R, h.at()), { home: 5, away: 5 }, 'back to even strength');
  // double minor: cut to 2:00 on first PP goal
  const dm = h.do('penalty', { side: 'home', kind: 'double', player: '8' }, { dt: 0 });
  h.wait(60_000);
  h.do('score', { side: 'away' }, { dt: 0 });
  eq(E.liveText(h.game, h.S(), 'pen:' + dm.id, h.at()), '2:00', 'double minor reduced to 2:00');
  // major is not released
  const mj = h.do('penalty', { side: 'home', kind: 'major', player: '3' }, { dt: 0 });
  h.wait(10_000);
  h.do('score', { side: 'away' }, { dt: 0 });
  eq(E.liveText(h.game, h.S(), 'pen:' + mj.id, h.at()), '4:50', 'major keeps running after a PP goal');
  // penalty carries over the intermission
  h.do('clock', { k: 'game', a: 'set', ms: 20_000 }, { dt: 0 });
  h.wait(20_000);
  h.do('endp', {}, { dt: 0 });
  const left = E.liveText(h.game, h.S(), 'pen:' + mj.id, h.at());
  h.wait(17 * 60000);
  eq(E.liveText(h.game, h.S(), 'pen:' + mj.id, h.at()), left, 'penalty time frozen during intermission');
  h.do('nextp');
  h.do('clock', { k: 'game', a: 'start' }, { dt: 0 });
  h.wait(60_000);
  const after = E.liveText(h.game, h.S(), 'pen:' + mj.id, h.at());
  eq(after, E.fmtClock(Math.ceil(((parseInt(left) * 60 + parseInt(left.split(':')[1])) * 1000 - 60_000)), {}), 'penalty resumes in the next period');
}
section('hockey · OT sudden death and shootout');
{
  const h = harness('hockey', 'pro');
  h.do('start');
  for (let P = 1; P <= 3; P++) { if (P > 1) h.do('nextp'); h.do('endp'); }
  eq(E.nextSteps(h.game, h.S()).map(s => s.id), ['next', 'so', 'final'], 'tie: OT, shootout or tie');
  h.do('nextp');
  eq(E.boardModel(h.game, h.S(), h.at()).center.badge, '3 on 3', 'OT strength badge');
  h.do('endp');
  h.do('so', { first: 'home' });
  h.do('kick', { side: 'home', made: true }); h.do('kick', { side: 'away', made: false });
  h.do('kick', { side: 'home', made: true });
  eq(h.S().so.w, null, '2-0 with two away shots left is open');
  h.do('kick', { side: 'away', made: false });
  eq(h.S().so.w, 'home', '2-0 with one away shot left decides a 3-round shootout');
  h.do('final');
  eq([h.S().score.home, h.S().winner], [1, 'home'], 'shootout winner credited with a goal');
  const o = harness('hockey', 'pro');
  o.do('start');
  for (let P = 1; P <= 3; P++) { if (P > 1) o.do('nextp'); o.do('endp'); }
  o.do('nextp'); o.do('clock', { k: 'game', a: 'start' }); o.wait(30_000);
  o.do('score', { side: 'away' }, { dt: 0 });
  eq([o.S().phase, o.S().decided], ['break', 'away'], 'OT goal ends the game');
}

/* ----------------------------------------------------------------- baseball */
section('baseball · NFHS');
{
  const h = harness('baseball', 'nfhs');
  const p = r => h.do('pitch', { r });
  // load the bases with walks, then walk in a run
  for (let b = 0; b < 4; b++) { p('ball'); p('ball'); p('ball'); p('ball'); }
  eq([h.S().score.away, h.S().bases], [1, [1, 1, 1]], 'bases-loaded walk forces in a run');
  eq(h.S().line.away, [1], 'line score');
  eq(h.S().pc.home['?'], 16, 'pitch count for fielding team');
  p('foul'); p('foul'); p('foul');
  eq(h.S().strikes, 2, 'foul with two strikes does not add a strike');
  p('strike');
  eq([h.S().outs, h.S().strikes], [1, 0], 'strikeout');
  h.do('out'); h.do('out');
  eq([h.S().half, h.S().inning, h.S().outs, h.S().bases], ['bottom', 1, 0, [0, 0, 0]], 'three outs flip the half-inning');
  ok(/Side retired/.test(h.last().note), 'side retired note');
  h.do('hit'); h.do('score', {}); h.do('error');
  eq([h.S().score.home, h.S().hits.home, h.S().errors.away], [1, 1, 1], 'R-H-E attribution');
  h.do('out'); h.do('out'); h.do('out');
  eq([h.S().half, h.S().inning, h.S().line.away], ['top', 2, [1, 0]], 'next inning starts');
  // jump to the 7th, home leading after the top
  for (let i = 2; i <= 6; i++) { h.do('half'); h.do('half'); }
  eq([h.S().inning, h.S().half], [7, 'top'], 'top of the 7th');
  h.do('score', {});
  h.do('half');
  eq([h.S().half, h.S().score], ['bottom', { home: 1, away: 2 }], 'away leads after top of 7th: home bats');
  h.do('score', {});
  eq(h.S().phase, 'live', 'tying run is not a walk-off');
  h.do('score', {});
  eq([h.S().phase, h.S().decided, h.S().overWhy], ['break', 'home', 'Walk-off win'], 'walk-off');
  h.do('pitch', { r: 'ball' });
  ok(h.last().rej, 'no pitches after the game ends');
}
section('baseball · run rule and extra-inning tiebreaker');
{
  const h = harness('baseball', 'nfhs');
  for (let i = 0; i < 10; i++) h.do('score', {}); // away scores 10 in the 1st
  for (let i = 1; i <= 4; i++) { h.do('half'); h.do('half'); }
  eq([h.S().inning, h.S().phase], [5, 'live'], 'run rule not before the 5th');
  h.do('half');
  eq(h.S().phase, 'live', 'away leading after top of 5th: home still bats');
  h.do('half');
  eq([h.S().phase, h.S().overWhy, h.S().decided], ['break', 'Run rule', 'away'], 'run rule after 5 complete innings');
  const m = harness('baseball', 'mlb');
  for (let i = 1; i <= 9; i++) { m.do('half'); m.do('half'); }
  eq([m.S().inning, m.S().half, m.S().bases], [10, 'top', [0, 1, 0]], 'runner placed on 2nd in the 10th');
  m.do('half');
  eq(m.S().bases, [0, 1, 0], 'runner on 2nd in the bottom half too');
  m.do('clock', { k: 'pitch', a: 'start' });
  eq(m.S().clocks.pitch.run, true, 'pitch clock runs');
  m.do('pitch', { r: 'ball' });
  eq(m.S().clocks.pitch.run, false, 'pitch resets the pitch clock');
}

/* ------------------------------------------------- merge, offline, corrections */
section('sync · merge order and offline replay');
{
  const game = E.newGame({ sport: 'basketball', presetId: 'nfhs', home, away, code: 'MERGE1', now: 0 });
  const a = (n, at, t, p) => ({ id: 'A.' + n, c: 'A', n, at, t, p });
  const b = (n, at, t, p) => ({ id: 'B.' + n, c: 'B', n, at, t, p });
  const evs = [
    a(1, 1000, 'clock', { k: 'game', a: 'start' }),
    a(2, 5000, 'score', { side: 'home', pts: 2 }),
    // B was offline: stopped the clock at 3000 and scored. Arrives last, ordered by timestamp.
    b(1, 3000, 'clock', { k: 'game', a: 'stop' }),
    b(2, 4000, 'score', { side: 'away', pts: 3 }),
  ];
  const S = E.replay(game, evs).S;
  eq(S.score, { home: 2, away: 3 }, 'commutative scores both apply');
  eq(S.clocks.game.ms, 8 * 60000 - 2000, 'offline stop applied at its original time: no drift');
  const S2 = E.replay(game, evs.slice().reverse()).S;
  eq(S2.clocks.game.ms, S.clocks.game.ms, 'arrival order does not matter');
  const dup = E.replay(game, evs.concat([a(2, 5000, 'score', { side: 'home', pts: 2 })]));
  ok(dup.S.score.home === 4, 'duplicates must be removed by the sync layer (engine trusts unique ids)');
  // last writer wins for state-setting actions
  const lw = E.replay(game, [a(1, 1000, 'clock', { k: 'game', a: 'set', ms: 300000 }), b(1, 1001, 'clock', { k: 'game', a: 'set', ms: 120000 })]).S;
  eq(lw.clocks.game.ms, 120000, 'later clock set wins');
}
section('corrections and audit');
{
  const h = harness('basketball', 'nfhs');
  h.do('score', { side: 'home', pts: 2 });
  h.do('set', { path: 'score.home', value: 5, reason: 'Missed a three' });
  eq([h.S().score.home, h.S().byPeriod.home], [5, [5]], 'score correction updates period breakdown');
  const last = h.last();
  ok(last.diff.some(d => d.k === 'Score' && /RVR 2/.test(d.from) && /RVR 5/.test(d.to)), 'before and after recorded');
  ok(/Correction: RVR score = 5 \(Missed a three\)/.test(last.desc), 'correction described with reason');
  h.do('set', { path: 'clocks.game.ms', value: 1 });
  ok(/cannot be corrected/.test(h.last().rej), 'arbitrary paths are refused');
  h.do('set', { path: 'fouls.away', value: 6, reason: 'Table count' });
  eq(E.SPORTS.basketball.bonus(h.S(), h.game.rules, 'home'), 1, 'corrected fouls drive bonus');
  const b = harness('baseball', 'nfhs');
  b.do('score', {}); b.do('set', { path: 'score.away', value: 3, reason: 'Ruling' });
  eq([b.S().score.away, b.S().line.away], [3, [3]], 'baseball correction updates line score');
}
section('every preset initialises and renders');
{
  E.SPORT_ORDER.forEach(id => E.SPORTS[id].presets.forEach(pr => {
    const game = E.newGame({ sport: id, presetId: pr.id, home, away, now: 0 });
    const S = E.initState(game);
    const m = E.boardModel(game, S, 0);
    ok(m.teams.home.name && m.period.short, id + '/' + pr.id + ' board model');
    E.SPORTS[id].fields.forEach(f => ok(f.k in game.rules, id + '/' + pr.id + ' has field ' + f.k));
  }));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
