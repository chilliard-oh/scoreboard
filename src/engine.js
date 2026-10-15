/* screenRIG Scoreboard · rules engine
 * Pure functions only: sport rulesets and presets, an event-sourced reducer with
 * undo, timestamp-based clocks, and a layout-neutral board model.
 * No DOM and no storage, so the app and the Node test suite share it. */
(function (root) {
'use strict';

const MIN = 60000, SEC = 1000;
const SIDES = ['home', 'away'];
const RULES_VERSION = '2026.10-draft';

const opp = s => (s === 'home' ? 'away' : 'home');
const isSide = s => s === 'home' || s === 'away';
const num = (v, d) => { v = Number(v); return Number.isFinite(v) ? v : d; };
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pad2 = n => (n < 10 ? '0' : '') + n;
const clone = o => JSON.parse(JSON.stringify(o));
const jersey = v => { const s = String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').slice(0, 3); return s || ''; };
const BAD = { rej: 'Invalid action' };
const tn = (g, side) => (g && g.teams && g.teams[side] && (g.teams[side].short || g.teams[side].name)) || (side === 'home' ? 'HOME' : 'AWAY');

/* ------------------------------------------------------------------ clocks */
function mkClock(ms, dir, extra) {
  return Object.assign({ run: false, ms: Math.max(0, ms || 0), t0: 0, dir: dir || 'down' }, extra || {});
}
function cval(c, now) {
  if (!c) return 0;
  if (!c.run) return c.ms;
  const d = Math.max(0, now - c.t0);
  return c.dir === 'up' ? c.ms + d : Math.max(0, c.ms - d);
}
/* A linked clock (basketball shot clock) can never run past its parent's expiry. */
function effNow(S, k, now) {
  const c = S.clocks[k];
  if (c && c.link) {
    const g = S.clocks[c.link];
    if (g && g.run && g.dir === 'down') return Math.min(now, g.t0 + g.ms);
  }
  return now;
}
function clockValue(S, k, now) { const c = S.clocks[k]; return c ? cval(c, effNow(S, k, now)) : 0; }
function cstart(S, k, at) {
  const c = S.clocks[k];
  if (!c || c.run) return false;
  if (c.dir !== 'up' && c.ms <= 0) return false;
  c.run = true; c.t0 = at; return true;
}
function cstop(S, k, at) {
  const c = S.clocks[k];
  if (!c || !c.run) return false;
  c.ms = clockValue(S, k, at); c.run = false; return true;
}
function linked(S, parent) { return Object.keys(S.clocks).filter(k => S.clocks[k] && S.clocks[k].link === parent); }
function startGameClock(S, at) {
  if (!cstart(S, 'game', at)) return false;
  linked(S, 'game').forEach(k => cstart(S, k, at));
  return true;
}
function stopGameClock(S, at) {
  linked(S, 'game').forEach(k => cstop(S, k, at));
  return cstop(S, 'game', at);
}
function stopAll(S, at) {
  Object.keys(S.clocks).forEach(k => { if (k !== 'brk' && S.clocks[k] && S.clocks[k].link) cstop(S, k, at); });
  Object.keys(S.clocks).forEach(k => { if (k !== 'brk') cstop(S, k, at); });
}
function fmtClock(ms, o) {
  o = o || {};
  ms = Math.max(0, ms);
  if (o.secs) {
    if (o.tenthsUnder && ms > 0 && ms < o.tenthsUnder) return (Math.floor(ms / 100) / 10).toFixed(1);
    return String(Math.ceil(ms / 1000));
  }
  if (o.tenths && ms < 60000) return Math.floor(ms / 1000) + '.' + Math.floor((ms % 1000) / 100);
  const t = o.up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  return Math.floor(t / 60) + ':' + pad2(t % 60);
}

/* ----------------------------------------------------------- shared moves */
function live(S) { if (S.phase === 'pre') S.phase = 'live'; }
function addPts(S, side, pts) {
  S.score[side] = Math.max(0, S.score[side] + pts);
  const i = Math.max(0, (S.period | 0) - 1), arr = S.byPeriod[side];
  while (arr.length <= i) arr.push(0);
  arr[i] = Math.max(0, arr[i] + pts);
}
function evalShootout(so) {
  const h = so.k.home, a = so.k.away, n = so.rounds;
  const hm = h.filter(Boolean).length, am = a.filter(Boolean).length;
  if (h.length <= n && a.length <= n) {
    if (hm > am + (n - a.length)) return 'home';
    if (am > hm + (n - h.length)) return 'away';
    return null;
  }
  if (h.length === a.length && hm !== am) return hm > am ? 'home' : 'away';
  return null;
}

/* ================================================================ SPORTS */
const SPORTS = {};

/* ------------------------------------------------------------ basketball */
SPORTS.basketball = {
  id: 'basketball', name: 'Basketball', clock: true, unit: 'points',
  presets: [
    { id: 'nfhs', name: 'High school', org: 'NFHS', rules: { periods: 4, periodMin: 8, otMin: 4, shot: true, shotFull: 35, shotShort: 0, foulWindow: 'period', bonusAt: 5, doubleAt: 0, otBonusAt: 0, foulOut: 5, toPer: 'game', toFull: 3, toShort: 2, toFullH2: 0, otTo: 1, otCarry: true, otFoulsCarry: true, breakMin: 1, halfMin: 10 } },
    { id: 'ncaam', name: "College men's", org: 'NCAA', rules: { periods: 2, periodMin: 20, otMin: 5, shot: true, shotFull: 30, shotShort: 20, foulWindow: 'half', bonusAt: 7, doubleAt: 10, otBonusAt: 0, foulOut: 5, toPer: 'game', toFull: 4, toShort: 0, toFullH2: 0, otTo: 1, otCarry: true, otFoulsCarry: true, breakMin: 1, halfMin: 15 } },
    { id: 'ncaaw', name: "College women's", org: 'NCAA', rules: { periods: 4, periodMin: 10, otMin: 5, shot: true, shotFull: 30, shotShort: 20, foulWindow: 'period', bonusAt: 5, doubleAt: 0, otBonusAt: 0, foulOut: 5, toPer: 'game', toFull: 4, toShort: 0, toFullH2: 0, otTo: 1, otCarry: true, otFoulsCarry: true, breakMin: 2, halfMin: 15 } },
    { id: 'nba', name: 'Pro', org: 'NBA', rules: { periods: 4, periodMin: 12, otMin: 5, shot: true, shotFull: 24, shotShort: 14, foulWindow: 'period', bonusAt: 5, doubleAt: 0, otBonusAt: 4, foulOut: 6, toPer: 'game', toFull: 7, toShort: 0, toFullH2: 0, otTo: 2, otCarry: false, otFoulsCarry: false, breakMin: 2, halfMin: 15 } },
    { id: 'fiba', name: 'International', org: 'FIBA', rules: { periods: 4, periodMin: 10, otMin: 5, shot: true, shotFull: 24, shotShort: 14, foulWindow: 'period', bonusAt: 5, doubleAt: 0, otBonusAt: 0, foulOut: 5, toPer: 'half', toFull: 2, toShort: 0, toFullH2: 3, otTo: 1, otCarry: false, otFoulsCarry: true, breakMin: 2, halfMin: 15 } },
    { id: 'rec', name: 'Youth / rec', org: 'Rec', rules: { periods: 4, periodMin: 6, otMin: 3, shot: false, shotFull: 30, shotShort: 0, foulWindow: 'half', bonusAt: 7, doubleAt: 10, otBonusAt: 0, foulOut: 5, toPer: 'game', toFull: 3, toShort: 0, toFullH2: 0, otTo: 1, otCarry: true, otFoulsCarry: true, breakMin: 1, halfMin: 5 } },
  ],
  fields: [
    { k: 'periods', label: 'Periods', type: 'select', options: [[4, '4 quarters'], [2, '2 halves']] },
    { k: 'periodMin', label: 'Period length', unit: 'min', type: 'num', min: 1, max: 30 },
    { k: 'otMin', label: 'Overtime length', unit: 'min', type: 'num', min: 1, max: 10 },
    { k: 'shot', label: 'Shot clock', type: 'bool' },
    { k: 'shotFull', label: 'Shot clock length', unit: 's', type: 'num', min: 10, max: 60, show: r => r.shot },
    { k: 'shotShort', label: 'Short reset', unit: 's', type: 'num', min: 0, max: 30, show: r => r.shot, hint: '0 = none' },
    { k: 'foulWindow', label: 'Team fouls reset', type: 'select', options: [['period', 'Every period'], ['half', 'Every half']] },
    { k: 'bonusAt', label: 'Bonus on team foul', type: 'num', min: 2, max: 15 },
    { k: 'doubleAt', label: 'Double bonus on foul', type: 'num', min: 0, max: 20, hint: '0 = none' },
    { k: 'foulOut', label: 'Foul out at', type: 'num', min: 3, max: 8 },
    { k: 'toFull', label: 'Full timeouts', type: 'num', min: 0, max: 10 },
    { k: 'toShort', label: '30-second timeouts', type: 'num', min: 0, max: 5 },
  ],
  regPeriods: R => R.periods,
  periodMs(S, R, P) { P = P || S.period; return (P > R.periods ? R.otMin : R.periodMin) * MIN; },
  label(S, R, P) {
    P = P || S.period;
    if (P > R.periods) { const n = P - R.periods; return { short: n === 1 ? 'OT' : n + 'OT', long: n === 1 ? 'overtime' : ord(n) + ' overtime' }; }
    if (R.periods === 2) return { short: ord(P).toUpperCase(), long: ord(P) + ' half' };
    return { short: 'Q' + P, long: ord(P) + ' quarter' };
  },
  init(S, R) {
    S.clocks.game = mkClock(R.periodMin * MIN);
    if (R.shot) S.clocks.shot = mkClock(R.shotFull * SEC, 'down', { link: 'game' });
    S.fouls = { home: 0, away: 0 };
    S.pf = { home: {}, away: {} };
    S.out = { home: [], away: [] };
    S.arrow = null;
    S.tol = { home: { full: R.toFull, short: R.toShort }, away: { full: R.toFull, short: R.toShort } };
  },
  bonusWith(S, R, f) {
    const ownOT = S.period > R.periods && !R.otFoulsCarry;
    const at = ownOT && R.otBonusAt ? R.otBonusAt : R.bonusAt;
    if (R.doubleAt && f >= R.doubleAt) return 2;
    return f >= at ? 1 : 0;
  },
  /* level of bonus the given side is shooting (0, 1, 2) */
  bonus(S, R, side) { return this.bonusWith(S, R, S.fouls[opp(side)]); },
  apply(S, ev, R, g) {
    const p = ev.p || {}, side = p.side;
    switch (ev.t) {
      case 'score': {
        const pts = num(p.pts, 0);
        if (!isSide(side) || [1, 2, 3, -1, -2, -3].indexOf(pts) < 0) return BAD;
        live(S); addPts(S, side, pts); return;
      }
      case 'foul': {
        if (!isSide(side)) return BAD;
        live(S);
        const o = opp(side), before = this.bonus(S, R, o);
        S.fouls[side]++;
        const res = {}, pl = jersey(p.player), notes = [];
        if (pl) {
          const n = (S.pf[side][pl] || 0) + 1; S.pf[side][pl] = n;
          if (n >= R.foulOut && S.out[side].indexOf(pl) < 0) { S.out[side].push(pl); notes.push('#' + pl + ' ' + tn(g, side) + ' fouled out'); res.alert = true; }
          else if (n === R.foulOut - 1) notes.push('#' + pl + ' ' + tn(g, side) + ' has ' + n + ' fouls');
        }
        const after = this.bonus(S, R, o);
        if (after > before) notes.push(tn(g, o) + ' in the ' + (after === 2 ? 'double bonus' : 'bonus'));
        if (notes.length) res.note = notes.join('. ');
        return res;
      }
      case 'timeout': {
        if (!isSide(side)) return BAD;
        const kind = p.kind === 'short' ? 'short' : 'full';
        if ((S.tol[side][kind] || 0) <= 0) return { rej: tn(g, side) + ' has no ' + (kind === 'short' ? '30-second' : 'full') + ' timeouts left' };
        live(S); S.tol[side][kind]--; stopAll(S, ev.at); return;
      }
      case 'arrow': if (!isSide(side)) return BAD; S.arrow = side; return;
    }
    return null;
  },
  onNext(S, R) {
    const P = S.period, reg = R.periods, ot = P > reg, h2 = P === reg / 2 + 1;
    S.clocks.game = mkClock(this.periodMs(S, R));
    if (R.shot) S.clocks.shot = mkClock(R.shotFull * SEC, 'down', { link: 'game' });
    if (ot) { if (!R.otFoulsCarry) S.fouls = { home: 0, away: 0 }; }
    else if (R.foulWindow === 'period' || (R.foulWindow === 'half' && h2)) S.fouls = { home: 0, away: 0 };
    if (ot) SIDES.forEach(s => { if (!R.otCarry) S.tol[s] = { full: 0, short: 0 }; S.tol[s].full += R.otTo; });
    else if (R.toPer === 'half' && h2) SIDES.forEach(s => { S.tol[s] = { full: R.toFullH2 || R.toFull, short: R.toShort }; });
  },
  breakMs(S, R) {
    const P = S.period, reg = R.periods;
    if (reg % 2 === 0 && P === reg / 2) return R.halfMin * MIN;
    if (P >= reg) return S.tie ? R.breakMin * MIN : 0;
    return R.breakMin * MIN;
  },
  hasHalftime: R => true,
  isDecision: (S, R, P) => P >= R.periods,
  summary(S, R, g) {
    const o = {};
    SIDES.forEach(s => { o[tn(g, s) + ' fouls'] = S.fouls[s]; o[tn(g, s) + ' timeouts'] = S.tol[s].full + S.tol[s].short; });
    o['Possession arrow'] = S.arrow ? tn(g, S.arrow) : '–';
    return o;
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'score': return (p.pts > 0 ? '+' : '−') + Math.abs(p.pts) + ' ' + tn(g, p.side);
      case 'foul': return 'Foul ' + tn(g, p.side) + (jersey(p.player) ? ' #' + jersey(p.player) : ' (team)');
      case 'timeout': return (p.kind === 'short' ? '30-second timeout ' : 'Timeout ') + tn(g, p.side);
      case 'arrow': return 'Possession arrow to ' + tn(g, p.side);
    }
    return null;
  },
  board(S, R, g) {
    const team = side => {
      const b = this.bonus(S, R, side);
      return {
        meta: [{ k: 'Fouls', v: S.fouls[side] }, { k: 'TOL', dots: S.tol[side].full, dots2: S.tol[side].short }],
        tags: b === 2 ? [{ t: 'Bonus +', tone: 'hot' }] : b ? [{ t: 'Bonus', tone: 'hot' }] : [],
        flags: S.out[side].length ? S.out[side].map(n => '#' + n + ' out') : [],
      };
    };
    return {
      teams: { home: team('home'), away: team('away') },
      center: {
        clock: { key: 'game', tenths: true },
        subs: R.shot ? [{ key: 'shot', label: 'Shot', secs: true, tenthsUnder: 5000, hideBelowGame: true }] : [],
        arrow: S.arrow,
      },
    };
  },
};

/* ------------------------------------------------------------ volleyball */
SPORTS.volleyball = {
  id: 'volleyball', name: 'Volleyball', clock: false, unit: 'points',
  presets: [
    { id: 'ncaa', name: 'College', org: 'NCAA', rules: { bestOf: 5, setTo: 25, decidingTo: 15, winBy: 2, cap: 0, toPerSet: 2, subsPerSet: 15, sideSwitchAt: 8, matchTimer: false } },
    { id: 'nfhs', name: 'High school', org: 'NFHS', rules: { bestOf: 5, setTo: 25, decidingTo: 15, winBy: 2, cap: 0, toPerSet: 2, subsPerSet: 18, sideSwitchAt: 8, matchTimer: false } },
    { id: 'fivb', name: 'International', org: 'FIVB', rules: { bestOf: 5, setTo: 25, decidingTo: 15, winBy: 2, cap: 0, toPerSet: 2, subsPerSet: 6, sideSwitchAt: 8, matchTimer: false } },
    { id: 'rec', name: 'Rec league', org: 'Rec', rules: { bestOf: 3, setTo: 25, decidingTo: 15, winBy: 2, cap: 27, toPerSet: 1, subsPerSet: 0, sideSwitchAt: 8, matchTimer: true } },
  ],
  fields: [
    { k: 'bestOf', label: 'Match', type: 'select', options: [[5, 'Best of 5'], [3, 'Best of 3']] },
    { k: 'setTo', label: 'Sets to', unit: 'pts', type: 'num', min: 5, max: 40 },
    { k: 'decidingTo', label: 'Deciding set to', unit: 'pts', type: 'num', min: 5, max: 30 },
    { k: 'cap', label: 'Point cap', unit: 'pts', type: 'num', min: 0, max: 50, hint: '0 = win by 2, no cap' },
    { k: 'toPerSet', label: 'Timeouts per set', type: 'num', min: 0, max: 4 },
    { k: 'subsPerSet', label: 'Subs per set', type: 'num', min: 0, max: 30, hint: '0 = unlimited' },
    { k: 'sideSwitchAt', label: 'Switch sides at', unit: 'pts', type: 'num', min: 0, max: 15, hint: 'Deciding set, 0 = off' },
    { k: 'matchTimer', label: 'Match timer', type: 'bool' },
  ],
  regPeriods: R => R.bestOf,
  label(S, R, P) { P = P || S.period; return { short: 'SET ' + P, long: 'set ' + P }; },
  init(S, R) {
    if (R.matchTimer) S.clocks.game = mkClock(0, 'up');
    S.sets = { home: 0, away: 0 };
    S.setScores = [];
    S.serve = 'home'; S.firstServe = 'home';
    S.to = { home: 0, away: 0 };
    S.subs = { home: 0, away: 0 };
    S.cards = { home: [], away: [] };
    S.switchNow = false; S.switched = false;
  },
  point(S, side, R, g, at) {
    addPts(S, side, 1);
    S.serve = side;
    S.switchNow = false;
    const deciding = S.period === R.bestOf;
    const target = deciding ? R.decidingTo : R.setTo;
    const a = S.score[side], b = S.score[opp(side)];
    const cap = R.cap ? (deciding ? Math.max(target, R.cap - (R.setTo - R.decidingTo)) : R.cap) : 0;
    if ((a >= target && a - b >= (R.winBy || 2)) || (cap && a >= cap)) {
      S.sets[side]++;
      S.setScores.push({ home: S.score.home, away: S.score.away, w: side });
      S.phase = 'break'; stopAll(S, at);
      S.endedPeriod = S.period;
      if (S.sets[side] >= Math.ceil(R.bestOf / 2)) { S.decided = side; return { note: tn(g, side) + ' wins the match ' + S.sets[side] + '–' + S.sets[opp(side)], alert: true }; }
      return { note: 'Set ' + S.period + ' to ' + tn(g, side) + ', ' + a + '–' + b };
    }
    if (deciding && R.sideSwitchAt && !S.switched && Math.max(a, b) === R.sideSwitchAt) {
      S.switchNow = true; S.switched = true;
      return { note: 'Switch sides', alert: true };
    }
    return null;
  },
  apply(S, ev, R, g) {
    const p = ev.p || {}, side = p.side;
    switch (ev.t) {
      case 'score':
        if (!isSide(side)) return BAD;
        if (S.phase === 'break') return { rej: 'Set ' + S.period + ' is over. Start the next set.' };
        live(S); return this.point(S, side, R, g, ev.at);
      case 'timeout':
        if (!isSide(side)) return BAD;
        if (S.to[side] >= R.toPerSet) return { rej: tn(g, side) + ' has no timeouts left this set' };
        live(S); S.to[side]++; return;
      case 'sub':
        if (!isSide(side)) return BAD;
        if (R.subsPerSet && S.subs[side] >= R.subsPerSet) return { rej: tn(g, side) + ' has used all ' + R.subsPerSet + ' substitutions' };
        live(S); S.subs[side]++; return;
      case 'card': {
        if (!isSide(side)) return BAD;
        const color = p.color === 'R' ? 'R' : 'Y';
        live(S);
        S.cards[side].push({ c: color, n: jersey(p.player), set: S.period });
        if (color === 'R') {
          if (S.phase === 'break') return { note: 'Red card ' + tn(g, side) };
          const r = this.point(S, opp(side), R, g, ev.at) || {};
          return { note: 'Red card ' + tn(g, side) + ': point and serve to ' + tn(g, opp(side)) + (r.note ? '. ' + r.note : ''), alert: r.alert };
        }
        return;
      }
      case 'serve': if (!isSide(side)) return BAD; S.serve = side; if (S.score.home + S.score.away === 0) S.firstServe = side; return;
    }
    return null;
  },
  onNext(S, R) {
    S.score = { home: 0, away: 0 };
    S.to = { home: 0, away: 0 }; S.subs = { home: 0, away: 0 };
    S.switchNow = false;
    S.firstServe = opp(S.firstServe); S.serve = S.firstServe;
  },
  breakMs: () => 3 * MIN,
  hasHalftime: () => false,
  isDecision: () => false,
  winner(S) { return S.sets.home === S.sets.away ? null : (S.sets.home > S.sets.away ? 'home' : 'away'); },
  summary(S, R, g) {
    const o = { Sets: S.sets.home + '–' + S.sets.away, Serve: tn(g, S.serve) };
    SIDES.forEach(s => { o[tn(g, s) + ' timeouts used'] = S.to[s]; o[tn(g, s) + ' subs'] = S.subs[s]; });
    return o;
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'score': return 'Point ' + tn(g, p.side);
      case 'timeout': return 'Timeout ' + tn(g, p.side);
      case 'sub': return 'Substitution ' + tn(g, p.side);
      case 'card': return (p.color === 'R' ? 'Red' : 'Yellow') + ' card ' + tn(g, p.side) + (jersey(p.player) ? ' #' + jersey(p.player) : '');
      case 'serve': return 'Serve to ' + tn(g, p.side);
    }
    return null;
  },
  board(S, R, g) {
    const team = side => ({
      big: { k: 'Sets', v: S.sets[side] },
      meta: [{ k: 'TO', dots: Math.max(0, R.toPerSet - S.to[side]) }].concat(R.subsPerSet ? [{ k: 'Subs', v: S.subs[side] }] : []),
      tags: S.cards[side].filter(c => c.set === S.period).map(c => ({ t: c.c === 'R' ? 'Red' : 'Yellow', tone: c.c === 'R' ? 'red' : 'yellow', card: c.c })),
      serve: S.phase === 'live' && S.serve === side,
    });
    return {
      teams: { home: team('home'), away: team('away') },
      center: { clock: R.matchTimer ? { key: 'game', up: true, small: true } : null, alert: S.switchNow ? 'Switch sides' : null },
      strip: S.setScores.length ? { kind: 'sets', items: S.setScores.map((x, i) => ({ n: i + 1, home: x.home, away: x.away, w: x.w })) } : null,
    };
  },
};

/* ---------------------------------------------------------------- soccer */
SPORTS.soccer = {
  id: 'soccer', name: 'Soccer', clock: true, unit: 'goals',
  presets: [
    { id: 'fifa', name: 'Pro', org: 'FIFA', rules: { periods: 2, periodMin: 45, clockDir: 'up', otMode: 'periods', otPeriods: 2, otMin: 15, shootout: true, soRounds: 5, toPerHalf: 0, halfMin: 15, showStats: true } },
    { id: 'ncaa', name: 'College', org: 'NCAA', rules: { periods: 2, periodMin: 45, clockDir: 'down', otMode: 'golden', otPeriods: 2, otMin: 10, shootout: true, soRounds: 5, toPerHalf: 0, halfMin: 10, showStats: true } },
    { id: 'nfhs', name: 'High school', org: 'NFHS', rules: { periods: 2, periodMin: 40, clockDir: 'down', otMode: 'golden', otPeriods: 2, otMin: 10, shootout: true, soRounds: 5, toPerHalf: 0, halfMin: 10, showStats: false } },
    { id: 'youth', name: 'Youth', org: 'Youth', rules: { periods: 2, periodMin: 30, clockDir: 'down', otMode: 'none', otPeriods: 0, otMin: 5, shootout: false, soRounds: 5, toPerHalf: 1, halfMin: 5, showStats: false } },
  ],
  fields: [
    { k: 'periods', label: 'Periods', type: 'select', options: [[2, '2 halves'], [4, '4 quarters']] },
    { k: 'periodMin', label: 'Period length', unit: 'min', type: 'num', min: 5, max: 60 },
    { k: 'clockDir', label: 'Clock', type: 'select', options: [['up', 'Counts up'], ['down', 'Counts down']] },
    { k: 'otMode', label: 'Overtime', type: 'select', options: [['none', 'None'], ['periods', 'Two full periods'], ['golden', 'Golden goal']] },
    { k: 'otMin', label: 'Overtime period', unit: 'min', type: 'num', min: 1, max: 20, show: r => r.otMode !== 'none' },
    { k: 'shootout', label: 'Penalty shootout', type: 'bool' },
    { k: 'toPerHalf', label: 'Timeouts per half', type: 'num', min: 0, max: 3 },
    { k: 'showStats', label: 'Show shots and corners', type: 'bool' },
  ],
  regPeriods: R => R.periods,
  otCount: R => (R.otMode === 'none' ? 0 : (R.otPeriods || 2)),
  periodMs(S, R, P) { P = P || S.period; return (P > R.periods ? R.otMin : R.periodMin) * MIN; },
  offsetMs(R, P) {
    if (P <= R.periods) return (P - 1) * R.periodMin * MIN;
    return R.periods * R.periodMin * MIN + (P - R.periods - 1) * R.otMin * MIN;
  },
  label(S, R, P) {
    if (!P && S.so) return { short: 'PK', long: 'penalty kicks' };
    P = P || S.period;
    if (P > R.periods) { const n = P - R.periods; return { short: 'OT' + (this.otCount(R) > 1 ? n : ''), long: (this.otCount(R) > 1 ? ord(n) + ' ' : '') + 'overtime' }; }
    if (R.periods === 4) return { short: 'Q' + P, long: ord(P) + ' quarter' };
    return { short: ord(P).toUpperCase(), long: ord(P) + ' half' };
  },
  init(S, R) {
    S.clocks.game = mkClock(R.clockDir === 'up' ? 0 : R.periodMin * MIN, R.clockDir === 'up' ? 'up' : 'down');
    S.cards = { home: [], away: [] };
    S.yel = { home: {}, away: {} };
    S.reds = { home: 0, away: 0 }; S.yellows = { home: 0, away: 0 };
    S.stats = { home: { shots: 0, corners: 0 }, away: { shots: 0, corners: 0 } };
    S.stoppage = 0;
    S.tol = { home: R.toPerHalf, away: R.toPerHalf };
  },
  apply(S, ev, R, g) {
    const p = ev.p || {}, side = p.side;
    switch (ev.t) {
      case 'score': {
        if (!isSide(side)) return BAD;
        const pts = num(p.pts, 1); if (pts !== 1 && pts !== -1) return BAD;
        live(S); addPts(S, side, pts);
        if (pts > 0 && S.period > R.periods && R.otMode === 'golden' && S.phase === 'live') {
          stopAll(S, ev.at); S.phase = 'break'; S.endedPeriod = S.period; S.decided = side;
          return { note: 'Golden goal ' + tn(g, side), alert: true };
        }
        return;
      }
      case 'card': {
        if (!isSide(side)) return BAD;
        live(S);
        const pl = jersey(p.player), color = p.color === 'R' ? 'R' : 'Y';
        if (color === 'Y' && pl && S.yel[side][pl]) {
          S.yellows[side]++; S.reds[side]++;
          S.cards[side].push({ c: 'Y2', n: pl, P: S.period });
          return { note: 'Second yellow: #' + pl + ' ' + tn(g, side) + ' sent off', alert: true };
        }
        if (color === 'Y') { S.yellows[side]++; if (pl) S.yel[side][pl] = 1; }
        else S.reds[side]++;
        S.cards[side].push({ c: color, n: pl, P: S.period });
        return color === 'R' ? { note: 'Red card #' + (pl || '?') + ' ' + tn(g, side), alert: true } : undefined;
      }
      case 'stat': {
        if (!isSide(side) || ['shots', 'corners'].indexOf(p.k) < 0) return BAD;
        S.stats[side][p.k] = Math.max(0, S.stats[side][p.k] + (num(p.d, 1) < 0 ? -1 : 1)); return;
      }
      case 'stoppage': S.stoppage = Math.max(0, Math.min(30, num(p.min, 0) | 0)); return;
      case 'timeout':
        if (!isSide(side)) return BAD;
        if (S.tol[side] <= 0) return { rej: tn(g, side) + ' has no timeouts left this half' };
        live(S); S.tol[side]--; stopAll(S, ev.at); return;
    }
    return null;
  },
  onNext(S, R) {
    const up = R.clockDir === 'up';
    S.clocks.game = mkClock(up ? 0 : this.periodMs(S, R), up ? 'up' : 'down');
    S.stoppage = 0;
    if (S.period <= R.periods) S.tol = { home: R.toPerHalf, away: R.toPerHalf };
  },
  breakMs(S, R) {
    const P = S.period;
    if (P === R.periods / 2 || (R.periods === 4 && P === 2)) return R.halfMin * MIN;
    if (P < R.periods) return 2 * MIN;
    return S.tie ? 5 * MIN : 0;
  },
  hasHalftime: () => true,
  isDecision(S, R, P) { return P === R.periods || P === R.periods + this.otCount(R); },
  summary(S, R, g) {
    const o = {};
    SIDES.forEach(s => { o[tn(g, s) + ' cards'] = S.yellows[s] + 'Y ' + S.reds[s] + 'R'; });
    if (R.showStats) SIDES.forEach(s => { o[tn(g, s) + ' shots'] = S.stats[s].shots; o[tn(g, s) + ' corners'] = S.stats[s].corners; });
    if (S.stoppage) o['Added time'] = '+' + S.stoppage;
    return o;
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'score': return (num(p.pts, 1) < 0 ? 'Goal removed ' : 'Goal ') + tn(g, p.side);
      case 'card': return (p.color === 'R' ? 'Red' : 'Yellow') + ' card ' + tn(g, p.side) + (jersey(p.player) ? ' #' + jersey(p.player) : '');
      case 'stat': return (num(p.d, 1) < 0 ? '−1 ' : '+1 ') + (p.k === 'corners' ? 'corner ' : 'shot ') + tn(g, p.side);
      case 'stoppage': return 'Added time +' + (num(p.min, 0) | 0);
      case 'timeout': return 'Timeout ' + tn(g, p.side);
    }
    return null;
  },
  board(S, R, g) {
    const team = side => ({
      meta: R.showStats ? [{ k: 'Shots', v: S.stats[side].shots }, { k: 'Corners', v: S.stats[side].corners }] : (R.toPerHalf ? [{ k: 'TO', dots: S.tol[side] }] : []),
      cards: { y: Math.max(0, S.yellows[side] - S.cards[side].filter(c => c.c === 'Y2').length), r: S.reds[side] },
    });
    return {
      teams: { home: team('home'), away: team('away') },
      center: {
        clock: S.so ? null : { key: 'game', up: R.clockDir === 'up', offset: R.clockDir === 'up' ? this.offsetMs(R, S.period) : 0, tenths: R.clockDir !== 'up' },
        badge: S.stoppage && !S.so ? '+' + S.stoppage : null,
      },
      strip: S.so ? { kind: 'shootout', so: S.so } : null,
    };
  },
};

/* -------------------------------------------------------------- football */
const FB_PTS = { td: 6, pat: 1, two: 2, fg: 3, safety: 2, d2: 2 };
const FB_NAME = { td: 'Touchdown', pat: 'PAT', two: 'Two-point conversion', fg: 'Field goal', safety: 'Safety', d2: 'Defensive two-point return' };
SPORTS.football = {
  id: 'football', name: 'Football', clock: true, unit: 'points',
  presets: [
    { id: 'nfhs', name: 'High school', org: 'NFHS', rules: { periodMin: 12, toPerHalf: 3, otMode: 'kansas', otYard: 10, otMin: 10, otTo: 1, twoPtFrom: 0, mercyDiff: 35, playLong: 40, playShort: 25, halfMin: 15 } },
    { id: 'ncaa', name: 'College', org: 'NCAA', rules: { periodMin: 15, toPerHalf: 3, otMode: 'kansas', otYard: 25, otMin: 10, otTo: 1, twoPtFrom: 3, mercyDiff: 0, playLong: 40, playShort: 25, halfMin: 20 } },
    { id: 'nfl', name: 'Pro', org: 'NFL', rules: { periodMin: 15, toPerHalf: 3, otMode: 'timed', otYard: 25, otMin: 10, otTo: 2, twoPtFrom: 0, mercyDiff: 0, playLong: 40, playShort: 25, halfMin: 13 } },
    { id: 'youth', name: 'Youth', org: 'Youth', rules: { periodMin: 10, toPerHalf: 3, otMode: 'kansas', otYard: 10, otMin: 10, otTo: 1, twoPtFrom: 0, mercyDiff: 28, playLong: 25, playShort: 25, halfMin: 10 } },
  ],
  fields: [
    { k: 'periodMin', label: 'Quarter length', unit: 'min', type: 'num', min: 4, max: 20 },
    { k: 'toPerHalf', label: 'Timeouts per half', type: 'num', min: 0, max: 5 },
    { k: 'otMode', label: 'Overtime', type: 'select', options: [['kansas', 'Alternating possessions'], ['timed', 'Timed period'], ['none', 'None (ties allowed)']] },
    { k: 'otYard', label: 'OT starts at', unit: 'yd', type: 'num', min: 3, max: 50, show: r => r.otMode === 'kansas' },
    { k: 'otMin', label: 'OT length', unit: 'min', type: 'num', min: 5, max: 15, show: r => r.otMode === 'timed' },
    { k: 'mercyDiff', label: 'Running clock at lead of', unit: 'pts', type: 'num', min: 0, max: 60, hint: '2nd half, 0 = off' },
    { k: 'playLong', label: 'Play clock', unit: 's', type: 'num', min: 10, max: 45 },
  ],
  regPeriods: () => 4,
  periodMs(S, R, P) { P = P || S.period; return (P > 4 ? R.otMin : R.periodMin) * MIN; },
  label(S, R, P) {
    P = P || S.period;
    if (P > 4) { const n = P - 4; return { short: n === 1 ? 'OT' : n + 'OT', long: n === 1 ? 'overtime' : ord(n) + ' overtime' }; }
    return { short: 'Q' + P, long: ord(P) + ' quarter' };
  },
  init(S, R) {
    S.clocks.game = mkClock(R.periodMin * MIN);
    S.clocks.play = mkClock(R.playLong * SEC);
    S.tol = { home: R.toPerHalf, away: R.toPerHalf };
    S.poss = null; S.down = 1; S.dist = 10; S.goal = false; S.ballOn = 25; S.ballSide = 'home';
    S.flag = false; S.mercy = false; S.twoPt = false;
  },
  apply(S, ev, R, g) {
    const p = ev.p || {}, side = p.side;
    switch (ev.t) {
      case 'score': {
        if (!isSide(side)) return BAD;
        const pts = FB_PTS[p.kind] || (num(p.pts, 0) === -1 ? -1 : 0);
        if (!pts) return BAD;
        live(S); addPts(S, side, pts);
        if (R.mercyDiff && !S.mercy && S.period >= 3 && Math.abs(S.score.home - S.score.away) >= R.mercyDiff) {
          S.mercy = true; return { note: 'Running clock: lead of ' + R.mercyDiff + ' or more', alert: true };
        }
        return;
      }
      case 'down': {
        const d = num(p.down, S.down) | 0;
        if (d < 1 || d > 4) return BAD;
        S.down = d;
        if (p.goal !== undefined) S.goal = !!p.goal;
        if (p.dist !== undefined) { S.dist = Math.max(1, Math.min(99, num(p.dist, S.dist) | 0)); if (p.goal === undefined) S.goal = false; }
        return;
      }
      case 'ball': {
        if (!isSide(side)) return BAD;
        S.ballOn = Math.max(1, Math.min(50, num(p.yd, 25) | 0)); S.ballSide = side; return;
      }
      case 'poss':
        if (!isSide(side)) return BAD;
        S.poss = side; S.down = 1; S.dist = 10; S.goal = false; return;
      case 'flag': S.flag = !!p.on; return;
      case 'timeout':
        if (!isSide(side)) return BAD;
        if (S.tol[side] <= 0) return { rej: tn(g, side) + ' has no timeouts left' + (S.period > 4 ? '' : ' this half') };
        live(S); S.tol[side]--; stopAll(S, ev.at); return;
    }
    return null;
  },
  onNext(S, R) {
    const P = S.period;
    if (P <= 4) {
      S.clocks.game = mkClock(R.periodMin * MIN);
      if (P === 3) S.tol = { home: R.toPerHalf, away: R.toPerHalf };
    } else if (R.otMode === 'timed') {
      S.clocks.game = mkClock(R.otMin * MIN);
      S.tol = { home: R.otTo, away: R.otTo };
    } else {
      delete S.clocks.game;
      S.tol = { home: R.otTo, away: R.otTo };
      S.ballOn = R.otYard; S.down = 1; S.dist = 10; S.goal = R.otYard <= 10;
      S.ballSide = S.poss ? opp(S.poss) : 'away';
      S.twoPt = !!(R.twoPtFrom && P - 4 >= R.twoPtFrom);
    }
    S.clocks.play = mkClock(R.playLong * SEC);
    S.flag = false;
  },
  breakMs(S, R) { if (S.period === 2) return R.halfMin * MIN; return 0; },
  hasHalftime: () => true,
  isDecision: (S, R, P) => P >= 4,
  allowOT: R => R.otMode !== 'none',
  summary(S, R, g) {
    const o = {};
    SIDES.forEach(s => { o[tn(g, s) + ' timeouts'] = S.tol[s]; });
    o.Possession = S.poss ? tn(g, S.poss) : '–';
    o.Down = ord(S.down) + ' & ' + (S.goal ? 'goal' : S.dist);
    o['Ball on'] = tn(g, S.ballSide) + ' ' + S.ballOn;
    o.Flag = S.flag ? 'on' : 'off';
    return o;
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'score': return p.kind ? FB_NAME[p.kind] + ' ' + tn(g, p.side) + ' (+' + FB_PTS[p.kind] + ')' : '−1 ' + tn(g, p.side);
      case 'down': return 'Down: ' + ord(num(p.down, S.down)) + ' & ' + (p.goal ? 'goal' : (p.dist !== undefined ? p.dist : S.dist));
      case 'ball': return 'Ball on ' + tn(g, p.side) + ' ' + p.yd;
      case 'poss': return 'Possession ' + tn(g, p.side);
      case 'flag': return p.on ? 'Flag on the play' : 'Flag cleared';
      case 'timeout': return 'Timeout ' + tn(g, p.side);
    }
    return null;
  },
  board(S, R, g) {
    const team = side => ({ meta: [{ k: 'TOL', dots: S.tol[side] }], poss: S.poss === side });
    const items = [];
    if (S.poss || S.period > 4) items.push({ k: 'Down', v: ord(S.down) + ' & ' + (S.goal ? 'Goal' : S.dist) });
    items.push({ k: 'Ball on', v: (S.ballOn === 50 ? '' : tn(g, S.ballSide) + ' ') + S.ballOn });
    return {
      teams: { home: team('home'), away: team('away') },
      center: {
        clock: S.clocks.game ? { key: 'game', tenths: true } : null,
        subs: [{ key: 'play', label: 'Play', secs: true, onlyRunning: true }],
        badge: S.mercy ? 'Running clock' : (S.twoPt ? '2-pt tries' : null),
      },
      strip: { kind: 'items', items: items, flag: S.flag },
    };
  },
};

/* ---------------------------------------------------------------- hockey */
const PEN = { minor: 2, double: 4, major: 5, misconduct: 10 };
const PEN_NAME = { minor: 'Minor', double: 'Double minor', major: 'Major', misconduct: 'Misconduct' };
SPORTS.hockey = {
  id: 'hockey', name: 'Hockey', clock: true, unit: 'goals',
  presets: [
    { id: 'pro', name: 'Pro', org: 'NHL', rules: { periodMin: 20, otMin: 5, otStrength: '3 on 3', shootout: true, soRounds: 3, soGoal: true, to: 1, intMin: 17 } },
    { id: 'ncaa', name: 'College', org: 'NCAA', rules: { periodMin: 20, otMin: 5, otStrength: '3 on 3', shootout: true, soRounds: 3, soGoal: false, to: 1, intMin: 15 } },
    { id: 'hs', name: 'High school', org: 'NFHS', rules: { periodMin: 15, otMin: 8, otStrength: '5 on 5', shootout: true, soRounds: 3, soGoal: true, to: 1, intMin: 10 } },
    { id: 'youth', name: 'Youth', org: 'Youth', rules: { periodMin: 12, otMin: 0, otStrength: '5 on 5', shootout: false, soRounds: 3, soGoal: false, to: 1, intMin: 5 } },
  ],
  fields: [
    { k: 'periodMin', label: 'Period length', unit: 'min', type: 'num', min: 5, max: 25 },
    { k: 'otMin', label: 'Overtime length', unit: 'min', type: 'num', min: 0, max: 20, hint: '0 = no overtime' },
    { k: 'otStrength', label: 'Overtime strength', type: 'select', options: [['5 on 5', '5 on 5'], ['4 on 4', '4 on 4'], ['3 on 3', '3 on 3']] },
    { k: 'shootout', label: 'Shootout', type: 'bool' },
    { k: 'soRounds', label: 'Shootout rounds', type: 'num', min: 1, max: 5, show: r => r.shootout },
    { k: 'to', label: 'Timeouts per game', type: 'num', min: 0, max: 3 },
  ],
  regPeriods: () => 3,
  periodMs(S, R, P) { P = P || S.period; return (P > 3 ? R.otMin : R.periodMin) * MIN; },
  label(S, R, P) {
    if (!P && S.so) return { short: 'SO', long: 'shootout' };
    P = P || S.period;
    if (P > 3) { const n = P - 3; return { short: n === 1 ? 'OT' : n + 'OT', long: n === 1 ? 'overtime' : ord(n) + ' overtime' }; }
    return { short: ord(P).toUpperCase(), long: ord(P) + ' period' };
  },
  init(S, R) {
    S.clocks.game = mkClock(R.periodMin * MIN);
    S.before = 0;
    S.pen = { home: [], away: [] };
    S.sog = { home: 0, away: 0 };
    S.tol = { home: R.to, away: R.to };
    S.empty = { home: false, away: false };
  },
  total(S, R, at) {
    const gc = S.clocks.game;
    if (S.phase !== 'live' || !gc) return S.before;
    return S.before + Math.max(0, this.periodMs(S, R) - cval(gc, at));
  },
  penLeft(S, R, pe, at) { return pe.rel ? 0 : Math.max(0, pe.dur - (this.total(S, R, at) - pe.start)); },
  activePen(S, R, side, at) {
    return S.pen[side].filter(pe => pe.kind !== 'misconduct' && this.penLeft(S, R, pe, at) > 0)
      .sort((a, b) => this.penLeft(S, R, a, at) - this.penLeft(S, R, b, at));
  },
  strength(S, R, at) {
    const h = Math.min(2, this.activePen(S, R, 'home', at).length), a = Math.min(2, this.activePen(S, R, 'away', at).length);
    if (S.period > 3 && R.otStrength === '3 on 3') return { home: 3 + Math.max(0, a - h), away: 3 + Math.max(0, h - a) };
    const base = S.period > 3 ? num(String(R.otStrength).charAt(0), 5) : 5;
    return { home: base - h, away: base - a };
  },
  apply(S, ev, R, g) {
    const p = ev.p || {}, side = p.side, at = ev.at;
    switch (ev.t) {
      case 'score': {
        if (!isSide(side)) return BAD;
        const pts = num(p.pts, 1); if (pts !== 1 && pts !== -1) return BAD;
        live(S);
        if (pts < 0) { addPts(S, side, -1); return; }
        const st = this.strength(S, R, at), notes = [];
        addPts(S, side, 1);
        if (st[side] > st[opp(side)]) {
          const pe = this.activePen(S, R, opp(side), at).filter(x => x.kind === 'minor' || x.kind === 'double')[0];
          if (pe) {
            const left = this.penLeft(S, R, pe, at);
            if (pe.kind === 'double' && left > 2 * MIN) pe.dur -= (left - 2 * MIN);
            else pe.rel = true;
            notes.push('Power-play goal: #' + (pe.n || '?') + ' ' + tn(g, opp(side)) + (pe.rel ? ' released' : ' penalty cut to 2:00'));
          }
        }
        if (S.period > 3 && S.phase === 'live') {
          stopAll(S, at); this.endBox(S, R, at); S.phase = 'break'; S.endedPeriod = S.period; S.decided = side;
          notes.push('Overtime winner ' + tn(g, side)); return { note: notes.join('. '), alert: true };
        }
        return notes.length ? { note: notes.join('. ') } : undefined;
      }
      case 'penalty': {
        if (!isSide(side) || !PEN[p.kind]) return BAD;
        live(S);
        S.pen[side].push({ id: ev.id, n: jersey(p.player), kind: p.kind, dur: PEN[p.kind] * MIN, start: this.total(S, R, at), rel: false });
        return { note: PEN_NAME[p.kind] + ' #' + (jersey(p.player) || '?') + ' ' + tn(g, side) + ' (' + PEN[p.kind] + ':00)' };
      }
      case 'stat': if (!isSide(side)) return BAD; S.sog[side] = Math.max(0, S.sog[side] + (num(p.d, 1) < 0 ? -1 : 1)); return;
      case 'empty': if (!isSide(side)) return BAD; S.empty[side] = !!p.on; return;
      case 'timeout':
        if (!isSide(side)) return BAD;
        if (S.tol[side] <= 0) return { rej: tn(g, side) + ' has no timeout left' };
        live(S); S.tol[side]--; stopAll(S, at); return;
    }
    return null;
  },
  endBox(S, R, at) { S.before = this.total(S, R, at); },
  onEnd(S, R, at) { S.before += Math.max(0, this.periodMs(S, R) - cval(S.clocks.game, at)); },
  onNext(S, R) { S.clocks.game = mkClock(this.periodMs(S, R)); S.empty = { home: false, away: false }; },
  breakMs(S, R) { if (S.period < 3) return R.intMin * MIN; return S.tie && R.otMin ? 2 * MIN : 0; },
  hasHalftime: () => false,
  isDecision: (S, R, P) => P >= 3,
  allowOT: R => R.otMin > 0,
  summary(S, R, g) {
    const o = {};
    SIDES.forEach(s => { o[tn(g, s) + ' shots'] = S.sog[s]; o[tn(g, s) + ' penalties'] = S.pen[s].length; });
    SIDES.forEach(s => { if (S.empty[s]) o[tn(g, s) + ' net'] = 'empty'; });
    return o;
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'score': return (num(p.pts, 1) < 0 ? 'Goal removed ' : 'Goal ') + tn(g, p.side);
      case 'penalty': return (PEN_NAME[p.kind] || 'Penalty') + ' #' + (jersey(p.player) || '?') + ' ' + tn(g, p.side);
      case 'stat': return (num(p.d, 1) < 0 ? '−1 shot ' : 'Shot on goal ') + tn(g, p.side);
      case 'empty': return (p.on ? 'Empty net ' : 'Goalie back ') + tn(g, p.side);
      case 'timeout': return 'Timeout ' + tn(g, p.side);
    }
    return null;
  },
  board(S, R, g, now) {
    const st = this.strength(S, R, now);
    const team = side => {
      const act = this.activePen(S, R, side, now).slice(0, 2).map(pe => ({ n: pe.n, live: 'pen:' + pe.id }));
      const tags = [];
      if (S.phase === 'live' && st[side] > st[opp(side)]) tags.push({ t: 'Power play', tone: 'hot' });
      if (S.empty[side]) tags.push({ t: 'Empty net', tone: 'warn' });
      return { meta: [{ k: 'Shots', v: S.sog[side] }], tags: tags, pens: act };
    };
    return {
      teams: { home: team('home'), away: team('away') },
      center: { clock: S.so ? null : { key: 'game', tenths: true }, badge: S.period > 3 && !S.so && S.phase === 'live' ? R.otStrength : (S.phase === 'live' && st.home !== st.away ? st.home + ' on ' + st.away : null) },
      strip: S.so ? { kind: 'shootout', so: S.so } : null,
    };
  },
};

/* -------------------------------------------------------------- baseball */
SPORTS.baseball = {
  id: 'baseball', name: 'Baseball / Softball', clock: false, unit: 'runs',
  presets: [
    { id: 'mlb', name: 'Pro baseball', org: 'MLB', rules: { innings: 9, pitchClock: 15, mercyRuns: 0, mercyAfter: 0, tiebreaker: true, tbFrom: 10, timeLimit: 0 } },
    { id: 'ncaa', name: 'College baseball', org: 'NCAA', rules: { innings: 9, pitchClock: 20, mercyRuns: 10, mercyAfter: 7, tiebreaker: false, tbFrom: 10, timeLimit: 0 } },
    { id: 'nfhs', name: 'High school baseball', org: 'NFHS', rules: { innings: 7, pitchClock: 0, mercyRuns: 10, mercyAfter: 5, tiebreaker: false, tbFrom: 8, timeLimit: 0 } },
    { id: 'softball', name: 'Softball', org: 'NCAA', rules: { innings: 7, pitchClock: 20, mercyRuns: 8, mercyAfter: 5, tiebreaker: true, tbFrom: 8, timeLimit: 0 } },
    { id: 'youth', name: 'Youth', org: 'Little League', rules: { innings: 6, pitchClock: 0, mercyRuns: 10, mercyAfter: 4, tiebreaker: false, tbFrom: 7, timeLimit: 0 } },
  ],
  fields: [
    { k: 'innings', label: 'Innings', type: 'num', min: 3, max: 9 },
    { k: 'mercyRuns', label: 'Run rule margin', unit: 'runs', type: 'num', min: 0, max: 20, hint: '0 = off' },
    { k: 'mercyAfter', label: 'Run rule after inning', type: 'num', min: 1, max: 9, show: r => r.mercyRuns > 0 },
    { k: 'tiebreaker', label: 'Runner on 2nd in extras', type: 'bool' },
    { k: 'tbFrom', label: 'Tiebreaker from inning', type: 'num', min: 2, max: 15, show: r => r.tiebreaker },
    { k: 'pitchClock', label: 'Pitch clock', unit: 's', type: 'num', min: 0, max: 30, hint: '0 = off' },
    { k: 'timeLimit', label: 'Time limit', unit: 'min', type: 'num', min: 0, max: 240, hint: '0 = none' },
  ],
  regPeriods: R => R.innings,
  label(S, R) { return { short: (S.half === 'top' ? '▲ ' : '▼ ') + ord(S.inning).toUpperCase(), long: (S.half === 'top' ? 'top' : 'bottom') + ' of the ' + ord(S.inning) }; },
  init(S, R) {
    S.inning = 1; S.half = 'top';
    S.balls = 0; S.strikes = 0; S.outs = 0; S.bases = [0, 0, 0];
    S.hits = { home: 0, away: 0 }; S.errors = { home: 0, away: 0 };
    S.line = { home: [], away: [0] };
    S.pitcher = { home: '', away: '' }; S.pc = { home: {}, away: {} };
    if (R.pitchClock) S.clocks.pitch = mkClock(R.pitchClock * SEC);
    if (R.timeLimit) S.clocks.game = mkClock(R.timeLimit * MIN);
  },
  bat: S => (S.half === 'top' ? 'away' : 'home'),
  resetCount(S) { S.balls = 0; S.strikes = 0; },
  runs(S, R, side, n, g, at) {
    S.score[side] = Math.max(0, S.score[side] + n);
    const i = S.inning - 1, L = S.line[side];
    while (L.length <= i) L.push(0);
    L[i] = Math.max(0, L[i] + n);
    if (n > 0 && side === 'home' && S.half === 'bottom') {
      if (S.inning >= R.innings && S.score.home > S.score.away) return this.over(S, 'home', 'Walk-off win', at);
      if (R.mercyRuns && S.inning >= R.mercyAfter && S.score.home - S.score.away >= R.mercyRuns) return this.over(S, 'home', 'Run rule', at);
    }
    return null;
  },
  over(S, w, why, at) {
    stopAll(S, at); S.phase = 'break'; S.decided = w; S.overWhy = why; S.endedPeriod = S.inning;
    return { note: why, alert: true };
  },
  endHalf(S, R, g, at, why) {
    const inn = S.inning, top = S.half === 'top', H = S.score.home, A = S.score.away;
    S.outs = 0; this.resetCount(S); S.bases = [0, 0, 0];
    if (S.clocks.pitch) S.clocks.pitch = mkClock(R.pitchClock * SEC);
    if (top) {
      if (inn >= R.innings && H > A) return this.over(S, 'home', why ? why + '. ' + tn(g, 'home') + ' wins' : 'Game over', at);
      if (R.mercyRuns && inn >= R.mercyAfter && H - A >= R.mercyRuns) return this.over(S, 'home', 'Run rule', at);
      S.half = 'bottom';
      while (S.line.home.length < inn) S.line.home.push(0);
    } else {
      if (inn >= R.innings && H !== A) return this.over(S, H > A ? 'home' : 'away', 'Game over', at);
      if (R.mercyRuns && inn >= R.mercyAfter && Math.abs(H - A) >= R.mercyRuns) return this.over(S, H > A ? 'home' : 'away', 'Run rule', at);
      S.half = 'top'; S.inning = inn + 1; S.period = S.inning;
      while (S.line.away.length < S.inning) S.line.away.push(0);
    }
    let note = (why ? why + '. ' : '') + this.label(S, R).long.replace(/^./, c => c.toUpperCase());
    if (R.tiebreaker && S.inning > R.innings && S.inning >= R.tbFrom) { S.bases[1] = 1; note += '. Runner placed on 2nd'; }
    return { note: note };
  },
  out(S, R, g, at, why) {
    S.outs++; this.resetCount(S);
    if (S.outs >= 3) return this.endHalf(S, R, g, at, why ? why + ', side retired' : 'Side retired');
    return why ? { note: why } : null;
  },
  apply(S, ev, R, g) {
    const p = ev.p || {}, at = ev.at, bat = this.bat(S), fld = opp(bat);
    const playing = ['pitch', 'out', 'hit', 'error', 'score', 'base', 'half'];
    if (playing.indexOf(ev.t) >= 0 && S.phase === 'break') return { rej: 'The game is over. Undo or correct to continue.' };
    switch (ev.t) {
      case 'pitch': {
        live(S);
        const who = S.pitcher[fld] || '?';
        S.pc[fld][who] = (S.pc[fld][who] || 0) + 1;
        if (S.clocks.pitch) { S.clocks.pitch = mkClock(R.pitchClock * SEC); }
        switch (p.r) {
          case 'ball': S.balls++;
            if (S.balls >= 4) {
              const b = S.bases;
              let res = null;
              if (b[0]) { if (b[1]) { if (b[2]) res = this.runs(S, R, bat, 1, g, at); b[2] = 1; } b[1] = 1; }
              b[0] = 1; this.resetCount(S);
              return res || { note: 'Walk' };
            }
            return;
          case 'strike': S.strikes++; if (S.strikes >= 3) return this.out(S, R, g, at, 'Strikeout'); return;
          case 'foul': if (S.strikes < 2) S.strikes++; return;
          case 'inplay': this.resetCount(S); return;
        }
        return BAD;
      }
      case 'out': live(S); return this.out(S, R, g, at, null);
      case 'hit': live(S); S.hits[bat]++; this.resetCount(S); return;
      case 'error': live(S); S.errors[fld]++; return;
      case 'score': {
        const n = num(p.pts, 1); if (n !== 1 && n !== -1) return BAD;
        live(S); return this.runs(S, R, isSide(p.side) ? p.side : bat, n, g, at);
      }
      case 'base': { const i = num(p.b, -1); if (i < 0 || i > 2) return BAD; S.bases[i] = p.on ? 1 : 0; return; }
      case 'count': S.balls = Math.max(0, Math.min(3, num(p.balls, S.balls) | 0)); S.strikes = Math.max(0, Math.min(2, num(p.strikes, S.strikes) | 0)); return;
      case 'pitcher': if (!isSide(p.side)) return BAD; S.pitcher[p.side] = jersey(p.num); return;
      case 'half': live(S); return this.endHalf(S, R, g, at, 'Half-inning ended');
    }
    return null;
  },
  hasHalftime: () => false,
  isDecision: () => false,
  summary(S, R, g) {
    return { Inning: this.label(S, R).long, Count: S.balls + '-' + S.strikes, Outs: S.outs, Bases: S.bases.map((b, i) => (b ? ['1st', '2nd', '3rd'][i] : '')).filter(Boolean).join(', ') || 'empty', Hits: S.hits.away + '–' + S.hits.home, Errors: S.errors.away + '–' + S.errors.home };
  },
  describe(ev, S, R, g) {
    const p = ev.p || {};
    switch (ev.t) {
      case 'pitch': return { ball: 'Ball', strike: 'Strike', foul: 'Foul ball', inplay: 'Ball in play' }[p.r] || 'Pitch';
      case 'out': return 'Out';
      case 'hit': return 'Hit ' + tn(g, this.bat(S));
      case 'error': return 'Error ' + tn(g, opp(this.bat(S)));
      case 'score': return (num(p.pts, 1) < 0 ? 'Run removed ' : 'Run ') + tn(g, isSide(p.side) ? p.side : this.bat(S));
      case 'base': return (p.on ? 'Runner on ' : 'Clear ') + ['1st', '2nd', '3rd'][num(p.b, 0)];
      case 'count': return 'Count set ' + p.balls + '-' + p.strikes;
      case 'pitcher': return 'Pitcher #' + jersey(p.num) + ' ' + tn(g, p.side);
      case 'half': return 'End of half-inning';
    }
    return null;
  },
  board(S, R) {
    const fld = opp(this.bat(S)), who = S.pitcher[fld];
    return {
      kind: 'baseball',
      innings: Math.max(R.innings, S.inning),
      line: S.line, hits: S.hits, errors: S.errors,
      inning: S.inning, half: S.half, bat: this.bat(S),
      balls: S.balls, strikes: S.strikes, outs: S.outs, bases: S.bases.slice(),
      pitch: { n: who, count: S.pc[fld][who || '?'] || 0 },
      center: { clock: S.clocks.game ? { key: 'game', small: true } : null, subs: S.clocks.pitch ? [{ key: 'pitch', label: 'Pitch', secs: true, onlyRunning: true }] : [] },
    };
  },
};

const SPORT_ORDER = ['basketball', 'volleyball', 'soccer', 'football', 'hockey', 'baseball'];

/* ============================================================= reducer */
function resolveRules(sportId, presetId, overrides) {
  const sp = SPORTS[sportId];
  const pr = sp.presets.find(x => x.id === presetId) || sp.presets[0];
  const R = clone(pr.rules);
  if (overrides) Object.keys(overrides).forEach(k => {
    if (!(k in R)) return;
    const v = overrides[k];
    R[k] = typeof R[k] === 'number' ? num(v, R[k]) : typeof R[k] === 'boolean' ? !!v : String(v);
  });
  return R;
}

function initState(game) {
  const sp = SPORTS[game.sport], R = game.rules;
  const S = {
    phase: 'pre', period: 1, endedPeriod: 0,
    score: { home: 0, away: 0 }, byPeriod: { home: [], away: [] },
    clocks: {}, tol: { home: 0, away: 0 },
    tie: false, decided: null, winner: null, so: null, soGoal: null, final: false,
  };
  sp.init(S, R, game);
  return S;
}

function canGoOT(sp, R) { return sp.allowOT ? sp.allowOT(R) : (sp.otCount ? sp.otCount(R) > 0 : true); }
function canShootout(sp, R) { return !!R.shootout; }

/* What the operator may do next, used by the controller's transition banner. */
function nextSteps(game, S) {
  const sp = SPORTS[game.sport], R = game.rules, steps = [];
  if (S.phase === 'final') return [{ id: 'reopen', label: 'Reopen game' }];
  if (S.phase === 'pre') return [{ id: 'start', label: 'Start game' }];
  if (S.phase === 'break') {
    if (S.decided) return [{ id: 'final', label: 'Confirm final' }];
    if (S.so) return [];
    if (S.tie) {
      const P = S.endedPeriod;
      const moreOT = sp.otCount ? P < R.periods + sp.otCount(R) : canGoOT(sp, R);
      if (moreOT) steps.push({ id: 'next', label: 'Start ' + sp.label(S, R, P + 1).long });
      if (canShootout(sp, R)) steps.push({ id: 'so', label: 'Start ' + (sp.id === 'soccer' ? 'penalty kicks' : 'shootout') });
      steps.push({ id: 'final', label: 'Final as a tie' });
      return steps;
    }
    return [{ id: 'next', label: 'Start ' + sp.label(S, R, S.period + 1).long }];
  }
  return steps;
}

function applyEvent(S, ev, game) {
  const sp = SPORTS[game.sport], R = game.rules, p = ev.p || {};
  if (S.phase === 'final' && ev.t !== 'final') return { rej: 'The game is final. Undo "Final" to make changes.' };
  switch (ev.t) {
    case 'start':
      if (S.phase !== 'pre') return { noop: true };
      S.phase = 'live'; return { note: 'Game started' };
    case 'clock': {
      const k = p.k || 'game', c = S.clocks[k], at = ev.at;
      if (!c) return { rej: 'That clock is not in use' };
      if (p.a === 'start') {
        if (k === 'game') {
          if (S.phase === 'pre') S.phase = 'live';
          if (S.phase !== 'live') return { rej: 'Start the next period first' };
          if (S.so) return { rej: 'No clock during a shootout' };
          return startGameClock(S, at) ? null : { noop: true };
        }
        return cstart(S, k, at) ? null : { noop: true };
      }
      if (p.a === 'stop') return (k === 'game' ? stopGameClock(S, at) : cstop(S, k, at)) ? null : { noop: true };
      if (p.a === 'set') {
        const v = Math.max(0, Math.min(6 * 60 * MIN, num(p.ms, c.ms)));
        if (c.run) { c.t0 = at; }
        c.ms = v;
        if (c.dir !== 'up' && v === 0) c.run = false;
        if (p.run === true && v > 0 && !c.run) { c.run = true; c.t0 = at; }
        return null;
      }
      if (p.a === 'adj') {
        const cur = clockValue(S, k, at);
        c.ms = Math.max(0, cur + num(p.d, 0));
        if (c.run) c.t0 = at;
        return null;
      }
      return BAD;
    }
    case 'endp': {
      if (S.phase !== 'live') return { noop: true };
      if (sp.id === 'volleyball' || sp.id === 'baseball') return { rej: 'This sport advances automatically' };
      if (S.so) return { rej: 'Finish the shootout first' };
      const at = ev.at;
      if (sp.onEnd) sp.onEnd(S, R, at);
      stopAll(S, at);
      S.phase = 'break'; S.endedPeriod = S.period;
      S.tie = false; S.decided = null;
      if (sp.isDecision(S, R, S.period)) {
        const d = S.score.home - S.score.away;
        if (d === 0) S.tie = true; else S.decided = d > 0 ? 'home' : 'away';
      }
      const brk = sp.breakMs ? sp.breakMs(S, R) : 0;
      if (brk && !S.decided) { S.clocks.brk = mkClock(brk); S.clocks.brk.run = true; S.clocks.brk.t0 = at; }
      else delete S.clocks.brk;
      return { note: 'End of ' + sp.label(S, R).long };
    }
    case 'nextp': {
      if (S.phase !== 'break' || S.decided || S.so) return { rej: 'Nothing to advance to' };
      if (sp.id === 'baseball') return { rej: 'Innings advance automatically' };
      S.period++; S.phase = 'live'; S.tie = false; S.decided = null;
      delete S.clocks.brk;
      sp.onNext(S, R, ev);
      return { note: 'Start of ' + sp.label(S, R).long };
    }
    case 'so': {
      if (!(S.phase === 'break' && S.tie) || !R.shootout) return { rej: 'A shootout is only available after a tie' };
      S.so = { first: isSide(p.first) ? p.first : 'home', k: { home: [], away: [] }, rounds: Math.max(1, num(R.soRounds, 5)), w: null };
      S.phase = 'live'; delete S.clocks.brk;
      return { note: (sp.id === 'soccer' ? 'Penalty kicks' : 'Shootout') + ' started' };
    }
    case 'kick': {
      if (!S.so || S.so.w) return { rej: 'No shootout in progress' };
      if (!isSide(p.side)) return BAD;
      S.so.k[p.side].push(!!p.made);
      const w = evalShootout(S.so);
      if (w) { S.so.w = w; S.phase = 'break'; S.decided = w; return { note: tn(game, w) + ' wins the ' + (sp.id === 'soccer' ? 'penalty shootout' : 'shootout'), alert: true }; }
      return null;
    }
    case 'final': {
      if (S.phase === 'final') return { noop: true };
      if (S.phase === 'live' && sp.clock && S.clocks.game) stopAll(S, ev.at);
      S.phase = 'final'; S.final = true;
      const w = sp.winner ? sp.winner(S, R) : (S.score.home === S.score.away ? (S.so && S.so.w) || null : (S.score.home > S.score.away ? 'home' : 'away'));
      S.winner = w;
      if (S.so && S.so.w && R.soGoal) { S.score[S.so.w] += 1; S.soGoal = S.so.w; }
      delete S.clocks.brk;
      return { note: w ? 'Final: ' + tn(game, w) + ' wins' : 'Final: tie' };
    }
    case 'set': return applyCorrection(S, ev, game);
  }
  if (S.phase === 'final') return { rej: 'The game is final' };
  const r = sp.apply(S, ev, R, game);
  if (r === null && !sp.describe(ev, S, R, game)) return { rej: 'Unknown action' };
  return r || null;
}

/* Manual correction mode: edit a value directly, always with a reason. */
const CORRECTABLE = {
  common: ['score.home', 'score.away', 'period'],
  basketball: ['fouls.home', 'fouls.away', 'tol.home.full', 'tol.away.full', 'tol.home.short', 'tol.away.short'],
  volleyball: ['sets.home', 'sets.away', 'to.home', 'to.away'],
  soccer: ['yellows.home', 'yellows.away', 'reds.home', 'reds.away', 'tol.home', 'tol.away'],
  football: ['tol.home', 'tol.away', 'down', 'dist'],
  hockey: ['sog.home', 'sog.away', 'tol.home', 'tol.away'],
  baseball: ['outs', 'balls', 'strikes', 'hits.home', 'hits.away', 'errors.home', 'errors.away'],
};
function applyCorrection(S, ev, game) {
  const p = ev.p || {}, path = String(p.path || '');
  const allowed = CORRECTABLE.common.concat(CORRECTABLE[game.sport] || []);
  if (allowed.indexOf(path) < 0) return { rej: 'That value cannot be corrected here' };
  const v = Math.max(0, Math.min(999, num(p.value, NaN) | 0));
  if (!Number.isFinite(num(p.value, NaN))) return BAD;
  const keys = path.split('.');
  if (path === 'period') {
    if (game.sport === 'baseball') { S.inning = Math.max(1, v); S.period = S.inning; return null; }
    S.period = Math.max(1, v); return null;
  }
  let o = S;
  for (let i = 0; i < keys.length - 1; i++) { o = o[keys[i]]; if (!o || typeof o !== 'object') return BAD; }
  const last = keys[keys.length - 1];
  if (keys[0] === 'score') {
    const side = last, d = v - S.score[side];
    if (game.sport === 'baseball') {
      const L = S.line[side], i = Math.max(0, S.inning - 1);
      while (L.length <= i) L.push(0);
      L[i] = Math.max(0, L[i] + d);
    } else addPts(S, side, d);
    S.score[side] = v;
    return null;
  }
  o[last] = v;
  return null;
}

/* Generic + sport description for the event log and the undo button. */
function describe(ev, S, game) {
  const sp = SPORTS[game.sport], R = game.rules, p = ev.p || {};
  switch (ev.t) {
    case 'start': return 'Game started';
    case 'final': return 'Final confirmed';
    case 'endp': return 'End of ' + sp.label(S, R).long;
    case 'nextp': return 'Start of ' + sp.label(S, R, S.period + 1).long;
    case 'so': return (game.sport === 'soccer' ? 'Penalty kicks' : 'Shootout') + ' started';
    case 'kick': return (p.made ? 'Scored ' : 'Missed ') + (game.sport === 'soccer' ? 'penalty ' : 'shot ') + tn(game, p.side);
    case 'set': return 'Correction: ' + labelPath(p.path, game) + ' = ' + p.value + (p.reason ? ' (' + String(p.reason).slice(0, 60) + ')' : '');
    case 'undo': return 'Undo';
    case 'clock': {
      const name = { game: 'Clock', shot: 'Shot clock', play: 'Play clock', pitch: 'Pitch clock', brk: 'Break clock' }[p.k || 'game'] || 'Clock';
      if (p.a === 'start') return name + ' started';
      if (p.a === 'stop') return name + ' stopped';
      if (p.a === 'set') return name + ' set to ' + fmtClock(num(p.ms, 0), { up: true }) + (p.run ? ' and started' : '');
      if (p.a === 'adj') { const d = num(p.d, 0); return name + ' ' + (d >= 0 ? '+' : '−') + (Math.abs(d) >= 1000 ? Math.abs(d) / 1000 + 's' : Math.abs(d) + 'ms'); }
      return name;
    }
  }
  return sp.describe(ev, S, R, game) || ev.t;
}
function labelPath(path, game) {
  const parts = String(path || '').split('.');
  const side = parts.find(isSide);
  const what = { score: 'score', period: game.sport === 'baseball' ? 'inning' : (game.sport === 'volleyball' ? 'set' : 'period'), fouls: 'team fouls', tol: 'timeouts left', sets: 'sets won', to: 'timeouts used', yellows: 'yellow cards', reds: 'red cards', sog: 'shots', outs: 'outs', balls: 'balls', strikes: 'strikes', hits: 'hits', errors: 'errors', down: 'down', dist: 'distance' }[parts[0]] || parts[0];
  const kind = parts[2] === 'short' ? ' (30s)' : '';
  return (side ? tn(game, side) + ' ' : '') + what + kind;
}

/* Event order: timestamp in the game's shared timebase, then device, then counter. */
function cmpEv(a, b) {
  if (a.at !== b.at) return a.at - b.at;
  if (a.c !== b.c) return a.c < b.c ? -1 : 1;
  return a.n - b.n;
}

function computeUndone(sorted) {
  const undone = new Set();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    if (e.t === 'undo' && !undone.has(e.id) && e.p && e.p.target) undone.add(e.p.target);
  }
  return undone;
}

function summaryOf(S, game, at) {
  const sp = SPORTS[game.sport], R = game.rules, o = {};
  o.Score = tn(game, 'home') + ' ' + S.score.home + ', ' + tn(game, 'away') + ' ' + S.score.away;
  o[game.sport === 'volleyball' ? 'Set' : game.sport === 'baseball' ? 'Inning' : 'Period'] = S.so ? sp.label(S, R).short : sp.label(S, R).short;
  o.Status = S.phase;
  Object.keys(S.clocks).forEach(k => {
    const c = S.clocks[k]; if (!c || k === 'brk') return;
    o[{ game: 'Clock', shot: 'Shot clock', play: 'Play clock', pitch: 'Pitch clock' }[k] || k] = fmtClock(clockValue(S, k, at), { up: c.dir === 'up', tenths: k === 'game' && c.dir !== 'up' }) + (c.run ? ' running' : ' stopped');
  });
  return Object.assign(o, sp.summary(S, R, game));
}
function diff(a, b) {
  const out = [];
  Object.keys(b).forEach(k => { if (a[k] !== b[k]) out.push({ k: k, from: a[k] === undefined ? '–' : a[k], to: b[k] }); });
  return out;
}

/* Replay the whole log. Returns current state plus an annotated log. */
function replay(game, events, opts) {
  opts = opts || {};
  const sorted = events.slice().sort(cmpEv);
  const undone = computeUndone(sorted);
  const S = initState(game);
  const log = [], byId = {};
  for (const ev of sorted) {
    let entry;
    if (ev.t === 'undo') {
      entry = { ev: ev, desc: 'Undo', isUndo: true, cancelled: undone.has(ev.id) };
    } else {
      const desc = describe(ev, S, game);
      if (undone.has(ev.id)) entry = { ev: ev, desc: desc, undone: true };
      else {
        const before = opts.noDiff ? null : summaryOf(S, game, ev.at);
        let res;
        try { res = applyEvent(S, ev, game) || {}; } catch (e) { res = { rej: 'Could not apply: ' + e.message }; }
        entry = { ev: ev, desc: desc, rej: res.rej, note: res.note, alert: !!res.alert, noop: !!res.noop };
        if (!opts.noDiff) entry.diff = diff(before, summaryOf(S, game, ev.at));
      }
    }
    byId[ev.id] = entry; log.push(entry);
  }
  log.forEach(e => { if (e.isUndo) { const t = byId[e.ev.p && e.ev.p.target]; e.desc = (t && t.isUndo ? 'Restore: ' + ((byId[t.ev.p.target] || {}).desc || 'action') : 'Undo: ' + (t ? t.desc : 'action')); } });
  return { S: S, log: log, undone: undone };
}

/* The last action an "Undo" tap should reverse. */
function undoTarget(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.isUndo || e.undone || e.rej || e.noop) continue;
    return e;
  }
  return null;
}

/* ========================================================== board model */
function teamBase(game, S, side) {
  const t = game.teams[side] || {};
  return { side: side, name: t.name || (side === 'home' ? 'Home' : 'Away'), short: t.short || (side === 'home' ? 'HOME' : 'AWAY'), logo: t.logo || null, c1: t.c1 || '#334155', c2: t.c2 || '#e2e8f0', score: S.score[side] };
}
function boardModel(game, S, now) {
  const sp = SPORTS[game.sport], R = game.rules;
  const m = sp.board(S, R, game, now) || {};
  m.sport = game.sport;
  m.kind = m.kind || 'standard';
  m.phase = S.phase;
  m.period = sp.label(S, R);
  m.unit = sp.unit;
  m.teams = m.teams || {};
  SIDES.forEach(s => { m.teams[s] = Object.assign(teamBase(game, S, s), m.teams[s] || {}); });
  m.winner = S.winner || null;
  m.decided = S.decided || null;
  m.soGoal = S.soGoal;
  if (S.phase === 'break') m.status = breakTitle(game, S);
  if (S.phase === 'final') m.status = 'Final' + (S.so && S.so.w ? (game.sport === 'soccer' ? ' · PK' : ' · SO') : (S.period > sp.regPeriods(R) && sp.id !== 'volleyball' && sp.id !== 'baseball' ? ' · ' + sp.label(S, R).short : ''));
  m.breakClock = S.clocks.brk ? 'brk' : null;
  m.breakdown = breakdown(game, S);
  return m;
}
function breakTitle(game, S) {
  const sp = SPORTS[game.sport], R = game.rules;
  if (game.sport === 'baseball') return S.overWhy || 'Game over';
  if (game.sport === 'volleyball') return S.decided ? 'Match to ' + tn(game, S.decided) : 'End of set ' + S.endedPeriod;
  if (S.so && S.so.w) return (game.sport === 'soccer' ? 'Penalties' : 'Shootout') + ' to ' + tn(game, S.so.w);
  const P = S.endedPeriod || S.period;
  if (S.decided && P > sp.regPeriods(R)) return 'End of ' + sp.label(S, R, P).long;
  if (S.decided) return 'End of regulation';
  if (S.tie && P === sp.regPeriods(R)) return 'Tied after regulation';
  if (S.tie) return 'Tied after ' + sp.label(S, R, P).long;
  const reg = sp.regPeriods(R);
  if (sp.hasHalftime(R) && reg % 2 === 0 && P === reg / 2) return 'Halftime';
  return 'End of ' + sp.label(S, R, P).long;
}
/* Score by period (or set, or inning) for the final screen and summary. */
function breakdown(game, S) {
  const sp = SPORTS[game.sport], R = game.rules;
  if (game.sport === 'baseball') {
    const n = Math.max(R.innings, S.inning);
    const cols = []; for (let i = 1; i <= n; i++) cols.push(String(i));
    return { cols: cols, rows: { away: S.line.away.slice(), home: S.line.home.slice() }, tail: ['R', 'H', 'E'], tails: { away: [S.score.away, S.hits.away, S.errors.away], home: [S.score.home, S.hits.home, S.errors.home] } };
  }
  if (game.sport === 'volleyball') {
    return { cols: S.setScores.map((x, i) => 'S' + (i + 1)), rows: { home: S.setScores.map(x => x.home), away: S.setScores.map(x => x.away) }, tail: ['Sets'], tails: { home: [S.sets.home], away: [S.sets.away] } };
  }
  const n = Math.max(S.period, S.byPeriod.home.length, S.byPeriod.away.length, 1);
  const cols = []; for (let P = 1; P <= n; P++) cols.push(sp.label(S, R, P).short);
  const rows = { home: [], away: [] };
  for (let i = 0; i < n; i++) SIDES.forEach(s => rows[s].push(S.byPeriod[s][i] || 0));
  const tail = ['T'], tails = { home: [S.score.home], away: [S.score.away] };
  if (S.so) { cols.push(game.sport === 'soccer' ? 'PK' : 'SO'); SIDES.forEach(s => rows[s].push(S.so.k[s].filter(Boolean).length)); }
  return { cols: cols, rows: rows, tail: tail, tails: tails };
}

/* Live text for anything that ticks: clocks and hockey penalty boxes. */
function liveText(game, S, key, now, spec) {
  spec = spec || {};
  if (key.indexOf('pen:') === 0) {
    const id = key.slice(4), sp = SPORTS.hockey;
    for (const s of SIDES) { const pe = (S.pen && S.pen[s] || []).find(x => x.id === id); if (pe) return fmtClock(sp.penLeft(S, game.rules, pe, now), {}); }
    return '';
  }
  const c = S.clocks[key]; if (!c) return '';
  const v = clockValue(S, key, now);
  return fmtClock(v + (spec.offset || 0), { up: c.dir === 'up', tenths: spec.tenths && c.dir !== 'up', secs: spec.secs, tenthsUnder: spec.tenthsUnder });
}
function clockRunning(S, key) { return !!(S.clocks[key] && S.clocks[key].run); }

/* ======================================================= game factory */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(rand) {
  rand = rand || Math.random; let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}
function newGame(o) {
  const sp = SPORTS[o.sport];
  const presetId = o.presetId || sp.presets[0].id;
  return {
    id: o.id || 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    code: o.code || newCode(),
    rev: 1, updatedAt: o.now || Date.now(), createdAt: o.now || Date.now(),
    timebase: o.timebase || null,
    sport: o.sport, presetId: presetId,
    rulesVersion: RULES_VERSION,
    rules: resolveRules(o.sport, presetId, o.overrides),
    teams: { home: o.home, away: o.away },
    display: o.display || {},
    venue: o.venue || '', start: o.start || '', pin: o.pin || '',
  };
}

const api = {
  MIN, SEC, SIDES, SPORTS, SPORT_ORDER, RULES_VERSION, CODE_CHARS,
  opp, ord, fmtClock, clockValue, clockRunning, cval, mkClock,
  resolveRules, newGame, newCode, initState, applyEvent, replay, undoTarget, cmpEv,
  describe, boardModel, breakdown, breakTitle, nextSteps, liveText, evalShootout, labelPath, CORRECTABLE, jersey,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.SBEngine = api;
})(typeof self !== 'undefined' ? self : this);
