/* Pure game logic — no DOM. Drives both the browser game and the pacing simulator. */
'use strict';

(function (global) {

const P = global.P;
const Dec = global.Dec;

// Precomputed log10(n!)
const LOG_FACT = [0];
for (let i = 1; i <= 20; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log10(i);

const FIRST_PRIMES = [2]; // extended lazily by the sieve

// ---------------- state ----------------

function newGame() {
  return {
    x: new Dec(0, 0),
    t: 0,
    degreesUnlocked: 1,
    termLevels: new Array(P.MAX_DEGREE + 1).fill(0),

    lemmas: new Dec(0, 0),
    totalLemmas: new Dec(0, 0),
    proofs: 0,
    totalProofs: 0,
    lemmaUps: {},

    converged: false,
    analysisUps: {},

    theorems: new Dec(0, 0),
    totalTheorems: new Dec(0, 0),
    theoremCount: 0,
    theoremUps: {},

    activeConj: null,
    conjDone: {},
    conjTimer: 0,

    fieldsUnlocked: {},
    activeFields: [],
    fieldState: {
      geometry: { side: 1, dims: 1, sideUp: 0, dimBought: 0, rho: new Dec(0, 0) },
      numtheory: { primeIdx: 0, nextIn: 0, logProd: 0, speedUp: 0, germain: false, rho: new Dec(0, 0) },
      combinatorics: { n: 1, progress: 0, speedUp: 0, rho: new Dec(0, 0) },
      chaos: { orbit: 0.4, rLevel: 0, best: 0, rho: new Dec(0, 0) },
      algebra: { idx: 0, progress: 0, speedUp: 0, rho: new Dec(0, 0) },
      logic: { level: 0, rho: new Dec(0, 0) },
    },

    paradigms: 0,
    lastParadigmLog: 0,
    lastParadigmReq: 0,
    achievements: {},
    clicks: 0,

    stats: {
      bestX: new Dec(0, 0),
      bestLog10x: 0,
      bestLog10Era: 0,   // best since last Theorem/Paradigm reset — scales conjecture targets
      lifetimeLemmas: new Dec(0, 0),
      playtime: 0,
      created: Date.now(),
    },
    settings: {
      notation: 'auto',
      autoProve: false,
      autoProveMult: 2,
      autoTheorem: false,
      buyAmount: 1,      // 1, 10, 'max'
    },
  };
}

// ---------------- derived values ----------------

function hasMilestone(s, id) {
  for (const m of P.PROOF_MILESTONES) {
    if (m.id === id) return s.totalProofs >= m.at;
  }
  return false;
}

function up(s, table, id) { return (s[table][id] || 0); }

function conjRule(s, id) { return s.activeConj === id; }

// Effective completions of a conjecture (Paradigm 4 doubles them)
function conjEff(s, id) {
  return (s.conjDone[id] || 0) * (s.paradigms >= 4 ? 2 : 1);
}

// Term milestone threshold (P vs NP reward brings it down from 25)
function effMilestone(s) {
  return Math.max(25 - conjEff(s, 'pvsnp'), 18);
}

function lemmaExponent(s) {
  let e = P.LEMMA_POW + 0.03 * up(s, 'lemmaUps', 'induction')
        + 0.02 * conjEff(s, 'legendre');
  if (s.paradigms >= 2) e += 0.10;
  return e;
}

function tSpeed(s) {
  let sp = Math.pow(1.25, up(s, 'lemmaUps', 'tempo'))
         * Math.pow(1.25, conjEff(s, 'collatz'));
  if (conjRule(s, 'legendre')) sp *= 0.25;
  return sp;
}

function beta(s) {
  if (!s.converged) return 0;
  if (s.activeConj) return 0;   // conjectures are proved by elementary methods
  const lv = up(s, 'analysisUps', 'beta');
  if (lv <= 0) return 0;
  return P.BETA_BASE * lv
       * Math.pow(1.15, up(s, 'analysisUps', 'betaMul'))
       * Math.pow(1.3, up(s, 'theoremUps', 'betaBoost'))
       * Math.pow(1.25, conjEff(s, 'riemannhyp'))
       * (1 + rigorLog10(s) / 1000);   // fields accelerate growth itself
}

function effectiveT(s) {
  let t = s.t * Math.pow(1.10, up(s, 'analysisUps', 'tphase'));
  if (s.paradigms >= 1) t *= Math.log10(1 + s.t);
  if (s.paradigms >= 6) t = Math.pow(t, 1.1);
  return t;
}

// log10 of the rigor multiplier from fields
function rigorLog10(s) {
  let sum = 0;
  for (const f of P.FIELDS) {
    const rho = s.fieldState[f.id].rho;
    if (rho.gt(0)) {
      sum += P.FIELD_WEIGHT[f.id] * Math.pow(Math.max(0, rho.log10()), P.RIGOR_DAMP);
    }
  }
  return sum;
}

// Global production multiplier M (Dec)
function prodMult(s) {
  let m = new Dec(1, 0);
  // lemmas
  const lem = s.lemmas.add(1);
  m = m.mul(Dec.pow10(lem.log10() * P.LEMMA_EFFECT_POW));
  // lemma upgrade: notation ×2/level
  m = m.mul(Dec.pow10(Math.log10(2) * up(s, 'lemmaUps', 'notation')));
  // theorem upgrade: rigor ×3/level
  m = m.mul(Dec.pow10(Math.log10(3) * up(s, 'theoremUps', 'rigor')));
  // conjecture reward: goldbach ×2/completion
  m = m.mul(Dec.pow10(Math.log10(2) * conjEff(s, 'goldbach')));
  // achievements
  const nAch = Object.keys(s.achievements).length;
  m = m.mul(Dec.pow10(Math.log10(P.ACHIEVEMENT_MULT) * nAch));
  // paradigms: ×1e3 each
  m = m.mul(Dec.pow10(3 * s.paradigms));
  // Riemann Hypothesis rule: M is square-rooted
  if (conjRule(s, 'riemannhyp')) m = Dec.pow10(m.log10() * 0.5);
  return m;
}

// dx/dt as a Dec
function production(s) {
  const t = s.t;
  let sum = new Dec(0, 0);
  const logT = t > 0 ? Math.log10(t) : -Infinity;
  for (let n = 0; n < s.degreesUnlocked; n++) {
    let lv = s.termLevels[n];
    if (lv <= 0) continue;
    if (conjRule(s, 'goldbach') && n % 2 === 1) continue;
    if (conjRule(s, 'pvsnp') && n !== s.degreesUnlocked - 1) continue;
    // milestone doubling every effMilestone levels, computed in log space
    const logMilestone = Math.floor(lv / effMilestone(s)) * Math.log10(2);
    if (n === 0) {
      sum = sum.add(Dec.pow10(Math.log10(lv) + logMilestone));
    } else {
      if (t <= 0) continue;
      const log = Math.log10(lv) + logMilestone + n * logT - LOG_FACT[n];
      sum = sum.add(Dec.pow10(log));
    }
  }
  if (sum.isZero()) return sum;
  let out = sum.mul(prodMult(s));
  const b = beta(s);
  if (b > 0) out = out.mul(Dec.exp(b * effectiveT(s)));
  return out;
}

// ---------------- purchases ----------------

function termCostR(s, n) {
  let r = P.TERM_R[n];
  if (conjRule(s, 'twinprime')) r = r * r;
  return r;
}

function termCost(s, n) {
  return Dec.costOf(P.TERM_BASE[n], termCostR(s, n), s.termLevels[n]);
}

const MAX_BULK_BUY = 1e8; // per call; levels beyond this add nothing meaningful

function buyTerm(s, n, count) {
  if (n >= s.degreesUnlocked) return 0;
  const r = termCostR(s, n);
  let want = count === 'max'
    ? Math.min(Dec.affordable(s.x, P.TERM_BASE[n], r, s.termLevels[n]), MAX_BULK_BUY)
    : count;
  // the affordable formula can overestimate by a step from fp error; back off a few times
  for (let tries = 0; want > 0 && tries < 8; tries++) {
    const cost = Dec.costSum(P.TERM_BASE[n], r, s.termLevels[n], want);
    if (cost.lte(s.x)) {
      s.x = s.x.sub(cost);
      s.termLevels[n] += want;
      return want;
    }
    want = (want > 4) ? Math.floor(want * 0.999) - 1 : want - 1;
  }
  return 0;
}

function degreeUnlockCost(s) {
  if (s.degreesUnlocked > P.MAX_DEGREE) return null;
  return Dec.from(P.DEGREE_UNLOCK[s.degreesUnlocked]);
}

function unlockDegree(s) {
  const c = degreeUnlockCost(s);
  if (!c || s.x.lt(c)) return false;
  s.x = s.x.sub(c);
  s.degreesUnlocked++;
  return true;
}

function upgradeCost(def, level) {
  return Dec.costOf(def.base, def.r, level);
}

function buyGenericUp(s, table, defs, id, currency) {
  const def = defs.find(d => d.id === id);
  if (!def) return false;
  const lv = up(s, table, id);
  if (lv >= def.max) return false;
  const cost = upgradeCost(def, lv);
  if (s[currency].lt(cost)) return false;
  s[currency] = s[currency].sub(cost);
  s[table][id] = lv + 1;
  return true;
}

const buyLemmaUp = (s, id) => buyGenericUp(s, 'lemmaUps', P.LEMMA_UPGRADES, id, 'lemmas');
const buyAnalysisUp = (s, id) => s.converged && buyGenericUp(s, 'analysisUps', P.ANALYSIS_UPGRADES, id, 'lemmas');
const buyTheoremUp = (s, id) => buyGenericUp(s, 'theoremUps', P.THEOREM_UPGRADES, id, 'theorems');

function canConverge(s) {
  return !s.converged && s.degreesUnlocked >= P.CONVERGENCE_DEGREE
      && s.lemmas.gte(P.CONVERGENCE_COST);
}
function buyConvergence(s) {
  if (!canConverge(s)) return false;
  s.lemmas = s.lemmas.sub(P.CONVERGENCE_COST);
  s.converged = true;
  return true;
}

// ---------------- prestige: proof ----------------

function lemmaGain(s) {
  if (s.x.lt(P.PROOF_REQ)) return new Dec(0, 0);
  const base = s.x.div(P.PROOF_REQ);
  let g = Dec.pow10(base.log10() * lemmaExponent(s));
  g = g.mul(Dec.pow10(Math.log10(5) * up(s, 'theoremUps', 'lemmaBoost')));
  g = g.mul(Dec.pow10(Math.log10(3) * conjEff(s, 'twinprime')));
  return g.floor();
}

function resetRun(s) {
  s.x = Dec.fromNumber(10);   // seed: enough to restart a₀ without manual clicking
  s.t = 0;
  s.degreesUnlocked = Math.min(P.MAX_DEGREE + 1,
    1 + up(s, 'lemmaUps', 'headstart') + conjEff(s, 'continuum'));
  const startLv = 5 * up(s, 'lemmaUps', 'coeffs') + 25 * conjEff(s, 'continuum');
  s.termLevels = s.termLevels.map((_, n) => (n < s.degreesUnlocked ? startLv : 0));
}

function canProve(s) { return s.x.gte(P.PROOF_REQ); }

// Effective target for a conjecture tier: listed floor, scaled up with best-ever x
function conjTarget(s, conjId, tier) {
  const conj = P.CONJECTURES.find(c => c.id === conjId);
  const listed = Dec.from(conj.target[tier]);
  const factor = P.CONJ_TARGET_FACTOR[Math.min(tier, P.CONJ_TARGET_FACTOR.length - 1)];
  const dynamic = Dec.pow10(factor * s.stats.bestLog10Era);
  return listed.max(dynamic);
}

function prove(s) {
  if (!canProve(s)) return false;
  // conjecture completion check
  if (s.activeConj) {
    const conj = P.CONJECTURES.find(c => c.id === s.activeConj);
    const done = s.conjDone[conj.id] || 0;
    if (done < conj.max && s.x.gte(conjTarget(s, conj.id, done))) {
      s.conjDone[conj.id] = done + 1;
    }
    s.activeConj = null;
    s.conjTimer = 0;
  }
  const g = lemmaGain(s);
  s.lemmas = s.lemmas.add(g);
  s.totalLemmas = s.totalLemmas.add(g);
  s.stats.lifetimeLemmas = s.stats.lifetimeLemmas.add(g);
  s.proofs++;
  s.totalProofs++;
  resetRun(s);
  return true;
}

function startConjecture(s, id) {
  if (!up(s, 'theoremUps', 'conjectures')) return false;
  const conj = P.CONJECTURES.find(c => c.id === id);
  if (!conj || (s.conjDone[id] || 0) >= conj.max) return false;
  if (s.activeConj) return false;
  s.activeConj = id;
  s.conjTimer = 0;
  if (s.paradigms < 5) resetRun(s);   // Paradigm 5: conjectures ride along with the run
  return true;
}

function exitConjecture(s) {
  if (!s.activeConj) return false;
  s.activeConj = null;
  s.conjTimer = 0;
  s.stats.abandoned = (s.stats.abandoned || 0) + 1;
  if (s.paradigms < 5) resetRun(s);
  return true;
}

// ---------------- prestige: theorem ----------------

function theoremGain(s) {
  const lg = s.x.isZero() ? 0 : s.x.log10();
  if (lg < P.THEOREM_REQ_LOG10) return new Dec(0, 0);
  let pow = P.THEOREM_POW;
  if (s.paradigms >= 2) pow += 0.10;
  if (s.paradigms >= 7) pow += 0.30;
  return Dec.fromNumber(Math.pow(lg / P.THEOREM_REQ_LOG10, pow)).floor();
}

function canTheorem(s) { return s.converged && theoremGain(s).gte(1); }

function claimTheorem(s) {
  if (!canTheorem(s)) return false;
  const g = theoremGain(s);
  s.theorems = s.theorems.add(g);
  s.totalTheorems = s.totalTheorems.add(g);
  s.theoremCount++;
  // reset the proof layer
  if (s.activeConj) { s.activeConj = null; s.conjTimer = 0; }
  s.lemmas = new Dec(0, 0);
  s.totalLemmas = new Dec(0, 0);
  s.proofs = 0;
  const keep = up(s, 'theoremUps', 'keepLemmaUps') > 0 || s.paradigms >= 1;
  if (!keep) { s.lemmaUps = {}; s.analysisUps = {}; }
  s.stats.bestLog10Era = 0;
  resetRun(s);
  return true;
}

// ---------------- fields ----------------

function unlockField(s, id) {
  if (!up(s, 'theoremUps', 'fields')) return false;
  const f = P.FIELDS.find(v => v.id === id);
  if (!f || s.fieldsUnlocked[id]) return false;
  const cost = Dec.from(f.unlockCost);
  if (s.theorems.lt(cost)) return false;
  s.theorems = s.theorems.sub(cost);
  s.fieldsUnlocked[id] = true;
  if (s.activeFields.length < maxActiveFields(s)) s.activeFields.push(id);
  return true;
}

function maxActiveFields(s) { return s.paradigms >= 8 ? 3 : (s.paradigms >= 3 ? 2 : 1); }

function setActiveField(s, id) {
  if (!s.fieldsUnlocked[id]) return false;
  if (s.activeFields.includes(id)) {
    s.activeFields = s.activeFields.filter(v => v !== id);
    return true;
  }
  if (s.activeFields.length >= maxActiveFields(s)) s.activeFields.shift();
  s.activeFields.push(id);
  return true;
}

// field upgrade costs are paid in theorems
function fieldUpCost(s, id) {
  const fs = s.fieldState[id];
  switch (id) {
    case 'geometry': return Dec.costOf(P.GEO.sideUpBase, P.GEO.sideUpR, fs.sideUp);
    case 'numtheory': return Dec.costOf(P.NT.speedUpBase, P.NT.speedUpR, fs.speedUp);
    case 'combinatorics': return Dec.costOf(P.COMBO.speedUpBase, P.COMBO.speedUpR, fs.speedUp);
    case 'chaos': return fs.rLevel >= P.CHAOS.maxRLevel ? null
      : Dec.costOf(P.CHAOS.rUpBase, P.CHAOS.rUpR, fs.rLevel);
    case 'algebra': return Dec.costOf(P.ALG.speedUpBase, P.ALG.speedUpR, fs.speedUp);
    case 'logic': return fs.level >= P.LOGIC.maxLevel ? null
      : Dec.costOf(P.LOGIC.upBase, P.LOGIC.upR, fs.level);
  }
  return null;
}

function geoDimCost(s) {
  const fs = s.fieldState.geometry;
  if (fs.dims >= P.GEO.maxDims) return null;
  return Dec.costOf(P.GEO.dimBase, P.GEO.dimR, fs.dimBought);
}

function buyFieldUp(s, id, which) {
  let cost;
  if (id === 'geometry' && which === 'dim') {
    cost = geoDimCost(s);
    if (!cost || s.theorems.lt(cost)) return false;
    s.theorems = s.theorems.sub(cost);
    s.fieldState.geometry.dims++;
    s.fieldState.geometry.dimBought++;
    return true;
  }
  cost = fieldUpCost(s, id);
  if (!cost || s.theorems.lt(cost)) return false;
  s.theorems = s.theorems.sub(cost);
  const fs = s.fieldState[id];
  if (id === 'geometry') fs.sideUp++;
  else if (id === 'chaos') fs.rLevel++;
  else if (id === 'logic') fs.level++;
  else fs.speedUp++;
  return true;
}

// Algebra helpers: name & log10(order) of the group at index i (past the list:
// "exotic structures", +3 log-order each)
function groupAt(i) {
  if (i < P.GROUPS.length) {
    return { name: P.GROUPS[i][0], logOrder: P.GROUPS[i][1], sporadic: !!P.GROUPS[i][2] };
  }
  const extra = i - P.GROUPS.length + 1;
  return { name: `exotic structure #${extra}`,
           logOrder: P.GROUPS[P.GROUPS.length - 1][1] + 3 * extra, sporadic: false };
}

function logicFraction(s) {
  return P.LOGIC.fracBase + P.LOGIC.fracStep * s.fieldState.logic.level;
}

function logicExponent(s) {
  let sum = 0;
  for (const f of P.FIELDS) {
    if (f.id === 'logic') continue;
    const rho = s.fieldState[f.id].rho;
    if (rho.gt(0)) sum += Math.max(0, rho.log10());
  }
  return Math.min(logicFraction(s) * sum, 25000);
}

function nthPrime(i) {
  while (FIRST_PRIMES.length <= i) {
    let c = FIRST_PRIMES[FIRST_PRIMES.length - 1] + 1;
    outer: while (true) {
      for (const p of FIRST_PRIMES) {
        if (p * p > c) break;
        if (c % p === 0) { c++; continue outer; }
      }
      break;
    }
    FIRST_PRIMES.push(c);
  }
  return FIRST_PRIMES[i];
}

function tickFields(s, dt) {
  const speedMult = s.paradigms >= 8 ? 25 : (s.paradigms >= 3 ? 5 : 1);
  for (const id of s.activeFields) {
    const fs = s.fieldState[id];
    if (id === 'geometry') {
      fs.side += P.GEO.sideRate * Math.pow(1.5, fs.sideUp) * dt * speedMult;
      // rho gain/s = side^dims
      const gain = Dec.pow10(fs.dims * Math.log10(fs.side)).mul(dt);
      fs.rho = fs.rho.add(gain);
    } else if (id === 'numtheory') {
      fs.nextIn -= dt * Math.pow(2, fs.speedUp) * speedMult;
      while (fs.nextIn <= 0) {
        const p = nthPrime(fs.primeIdx);
        fs.logProd += Math.log10(p);
        fs.primeIdx++;
        // Sophie Germain pair check: p and (p-1)/2 both prime, both sizeable
        if (!fs.germain && p > 200 && (p - 1) % 2 === 0 && isSmallPrime((p - 1) / 2)) {
          fs.germain = true;
        }
        const nextP = nthPrime(fs.primeIdx);
        fs.nextIn += Math.pow(nextP / 10, 0.8);
      }
      if (fs.logProd > 0) fs.rho = fs.rho.add(Dec.pow10(fs.logProd).mul(dt));
    } else if (id === 'combinatorics') {
      fs.progress += dt * Math.pow(2, fs.speedUp) * speedMult;
      const interval = P.COMBO.baseInterval * Math.pow(P.COMBO.intervalR, fs.n);
      while (fs.progress >= interval) { fs.progress -= interval; fs.n++; }
      const logFact = fs.n <= 20 ? LOG_FACT[Math.min(fs.n, 20)] : logFactorial(fs.n);
      fs.rho = fs.rho.add(Dec.pow10(logFact).mul(dt));
    } else if (id === 'chaos') {
      const r = P.CHAOS.rBase + P.CHAOS.rStep * fs.rLevel;
      // iterate the map a few times per second of game time
      const iters = Math.max(1, Math.round(dt * 4));
      for (let i = 0; i < iters; i++) {
        fs.orbit = r * fs.orbit * (1 - fs.orbit);
        if (fs.orbit <= 0 || fs.orbit >= 1) fs.orbit = 0.4; // escape guard
        if (fs.orbit > fs.best) fs.best = fs.orbit;
      }
      // gain scales with orbit value and total theorems earned (keeps it relevant)
      const scale = Math.min(s.totalTheorems.add(1).log10() + 1, P.CHAOS_SCALE_CAP);
      fs.rho = fs.rho.add(Dec.pow10(fs.orbit * scale * 4).mul(dt));
    } else if (id === 'algebra') {
      fs.progress += dt * Math.pow(2, fs.speedUp) * speedMult;
      let interval = P.ALG.baseInterval * Math.pow(P.ALG.intervalR, fs.idx);
      while (fs.progress >= interval) {
        fs.progress -= interval;
        fs.idx++;
        interval = P.ALG.baseInterval * Math.pow(P.ALG.intervalR, fs.idx);
      }
      if (fs.idx > 0) fs.rho = fs.rho.add(Dec.pow10(groupAt(fs.idx - 1).logOrder).mul(dt));
    } else if (id === 'logic') {
      const ex = logicExponent(s);
      if (ex > 0) fs.rho = fs.rho.add(Dec.pow10(ex).mul(dt));
    }
  }
}

function isSmallPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

function logFactorial(n) { // Stirling
  if (n <= 20) return LOG_FACT[n];
  return (n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n)) / Math.LN10;
}

// ---------------- prestige: paradigm ----------------

function canParadigm(s) {
  return !s.x.isZero() && s.x.log10() >= paradigmReqLog10(s);
}
function paradigmReqLog10(s) {
  // Fixed geometric ladder (2000·2^n). With superexponential late-game growth,
  // any requirement derived from the achieved value boom-busts (a lucky overnight
  // run walls the next shift for weeks); a fixed ladder decelerates smoothly.
  return P.PARADIGM_REQ_LOG10 * Math.pow(P.PARADIGM_REQ_RATIO, s.paradigms);
}

function doParadigm(s) {
  if (!canParadigm(s)) return false;
  s.lastParadigmReq = paradigmReqLog10(s);
  s.paradigms++;
  s.lastParadigmLog = s.x.log10();
  // reset theorem layer and below; fields, conjectures, milestones, achievements persist
  s.theorems = new Dec(0, 0);
  s.theoremCount = 0;
  s.theoremUps = { conjectures: 1, fields: 1 }; // permanence of unlocks
  // head start: a paradigm-scaled lemma seed skips the Act I retread entirely
  s.lemmas = Dec.pow10(8 * s.paradigms);
  s.stats.bestLog10Era = 0;
  s.totalLemmas = new Dec(0, 0);
  s.proofs = 0;
  s.lemmaUps = {};
  s.analysisUps = {};
  s.activeConj = null;
  resetRun(s);
  return true;
}

// ---------------- automation ----------------

function runAutomation(s) {
  if (hasMilestone(s, 'autoDeg')) {
    while (s.degreesUnlocked <= P.MAX_DEGREE) {
      const c = degreeUnlockCost(s);
      if (!c || s.x.lt(c.mul(10))) break; // unlock when 10× affordable, keeps cash for terms
      unlockDegree(s);
    }
  }
  const autoMap = [['auto0', 0], ['auto1', 1], ['auto2', 2], ['auto3', 3],
                   ['auto4', 4], ['auto5', 5]];
  for (const [id, n] of autoMap) {
    if (hasMilestone(s, id)) buyTerm(s, n, 'max');
  }
  if (hasMilestone(s, 'auto6')) {
    for (let n = 6; n <= P.MAX_DEGREE; n++) buyTerm(s, n, 'max');
  }
  if (up(s, 'theoremUps', 'autoAnalysis') && s.converged) {
    for (const d of P.ANALYSIS_UPGRADES) buyAnalysisUp(s, d.id);
  }
  const bigTheoremReady = s.converged
    && theoremGain(s).gte(s.theorems.mul(2).max(1));
  if (s.settings.autoProve && hasMilestone(s, 'autoProve') && !s.activeConj
      && !canParadigm(s)      // never auto-reset through an available Paradigm
      && !bigTheoremReady) {  // …or past a theorem claim worth ≥2× current holdings
    const g = lemmaGain(s);
    const threshold = s.lemmas.mul(s.settings.autoProveMult).max(1);
    if (g.gte(threshold)) prove(s);
  }
  // Paradigm 1 unlocks auto-theorem claiming
  if (s.settings.autoTheorem && s.paradigms >= 1 && !s.activeConj && !canParadigm(s)) {
    const g = theoremGain(s);
    if (g.gte(1) && g.gte(s.theorems.mul(2))) claimTheorem(s);
  }
}

// ---------------- achievements ----------------

function checkAchievements(s) {
  const a = s.achievements;
  const grant = id => { if (!a[id]) { a[id] = true; return true; } return false; };
  const newly = [];
  const test = (id, cond) => { if (cond && grant(id)) newly.push(id); };
  test('peano', s.clicks >= 10);
  test('gauss', s.x.gte(5050) || s.stats.bestX.gte(5050));
  test('euler', s.degreesUnlocked >= 3);
  test('noether', s.totalProofs >= 1);
  test('erdos', s.totalProofs >= 10);
  test('ramanujan', s.stats.lifetimeLemmas.gte(1729));
  test('taylor', s.degreesUnlocked >= 6);
  test('cauchy', s.converged);
  test('hilbert', s.theoremCount >= 1 || s.totalTheorems.gte(1));
  test('godel', Object.values(s.conjDone).some(v => v >= 1));
  test('galois', Object.keys(s.fieldsUnlocked).length >= 1);
  test('riemann', s.fieldState.numtheory.primeIdx > 0 && nthPrime(Math.max(0, s.fieldState.numtheory.primeIdx - 1)) > 1000);
  test('cantor', s.stats.bestLog10x >= 308);
  test('kuhn', s.paradigms >= 1);
  test('lorenz', s.fieldState.chaos.best > 0.99);
  test('wiles', P.CONJECTURES.some(c => (s.conjDone[c.id] || 0) >= c.max));
  test('hardy', s.stats.bestLog10x >= 100);
  test('fibonacci', s.t >= 6765);
  test('fermat', (s.stats.abandoned || 0) >= 1);
  test('euclid', s.fieldState.geometry.dims >= 5);
  test('germain', !!s.fieldState.numtheory.germain);
  test('conway', s.fieldState.algebra.idx > 0 && groupAt(s.fieldState.algebra.idx - 1).sporadic);
  test('griess', s.fieldState.algebra.idx >= P.GROUPS.length);
  test('turing', !!s.fieldsUnlocked.logic);
  test('archimedes', rigorLog10(s) >= 1000);
  test('banach', s.activeFields.length >= 2);
  test('hypatia', s.paradigms >= 2);
  test('poincare', s.paradigms >= 4);
  test('grothendieck', s.paradigms >= 6);
  return newly;
}

// ---------------- main tick ----------------

function tick(s, dt) {
  const sp = tSpeed(s);
  s.t += dt * sp;
  s.stats.playtime += dt;

  const dxdt = production(s);
  if (!dxdt.isZero()) s.x = s.x.add(dxdt.mul(dt * sp));

  // conjecture rules with periodic effects
  if (conjRule(s, 'collatz')) {
    s.conjTimer += dt;
    while (s.conjTimer >= 30) { s.conjTimer -= 30; s.x = s.x.div(2); }
  }
  if (conjRule(s, 'continuum') && s.t > 60) s.t = 60;

  // Paradigm 5: conjectures complete themselves when their target is met
  if (s.activeConj && s.paradigms >= 5) {
    const conj = P.CONJECTURES.find(c => c.id === s.activeConj);
    const done = s.conjDone[conj.id] || 0;
    if (done < conj.max && s.x.gte(conjTarget(s, conj.id, done))) {
      s.conjDone[conj.id] = done + 1;
      s.activeConj = null;
      s.conjTimer = 0;
    }
  }

  if (s.x.gt(s.stats.bestX)) {
    s.stats.bestX = s.x.clone();
    s.stats.bestLog10x = Math.max(s.stats.bestLog10x, s.x.isZero() ? 0 : s.x.log10());
  }
  if (!s.x.isZero()) {
    s.stats.bestLog10Era = Math.max(s.stats.bestLog10Era, s.x.log10());
  }
  s.stats.maxDegrees = Math.max(s.stats.maxDegrees || 1, s.degreesUnlocked);

  tickFields(s, dt);
  runAutomation(s);
}

function clickIncrement(s) {
  const dxdt = production(s);
  const add = dxdt.mul(P.CLICK_FRACTION).max(1);
  s.x = s.x.add(add);
  s.clicks++;
  return add;
}

// ---------------- serialization ----------------

const DEC_FIELDS = ['x', 'lemmas', 'totalLemmas', 'theorems', 'totalTheorems'];

function serialize(s) {
  return JSON.parse(JSON.stringify(s)); // Dec.toJSON handles Dec fields
}

function deserialize(raw) {
  const s = newGame();
  // shallow-merge known keys, reviving Decs
  for (const k of Object.keys(s)) {
    if (!(k in raw)) continue;
    if (DEC_FIELDS.includes(k)) s[k] = Dec.from(raw[k]);
    else s[k] = raw[k];
  }
  // revive nested
  s.stats = Object.assign(newGame().stats, raw.stats || {});
  s.stats.bestX = Dec.from((raw.stats && raw.stats.bestX) || 0);
  s.stats.lifetimeLemmas = Dec.from((raw.stats && raw.stats.lifetimeLemmas) || 0);
  s.settings = Object.assign(newGame().settings, raw.settings || {});
  const fresh = newGame().fieldState;
  for (const id of Object.keys(fresh)) {
    s.fieldState[id] = Object.assign(fresh[id], (raw.fieldState || {})[id] || {});
    s.fieldState[id].rho = Dec.from(s.fieldState[id].rho || 0);
  }
  if (!Array.isArray(s.termLevels) || s.termLevels.length !== P.MAX_DEGREE + 1) {
    s.termLevels = new Array(P.MAX_DEGREE + 1).fill(0);
  }
  if (!Array.isArray(s.activeFields)) s.activeFields = [];
  return s;
}

// ---------------- exports ----------------

global.Logic = {
  newGame, tick, clickIncrement, production, prodMult, tSpeed, beta, effectiveT,
  termCost, termCostR, buyTerm, degreeUnlockCost, unlockDegree,
  upgradeCost, buyLemmaUp, buyAnalysisUp, buyTheoremUp,
  canConverge, buyConvergence,
  lemmaGain, lemmaExponent, canProve, prove,
  theoremGain, canTheorem, claimTheorem,
  startConjecture, exitConjecture, conjTarget,
  unlockField, setActiveField, buyFieldUp, fieldUpCost, geoDimCost, maxActiveFields,
  canParadigm, paradigmReqLog10, doParadigm,
  hasMilestone, checkAchievements, runAutomation, rigorLog10,
  serialize, deserialize, nthPrime,
  conjEff, effMilestone, groupAt, logicFraction, logicExponent,
};
})(typeof window !== 'undefined' ? window : globalThis);
