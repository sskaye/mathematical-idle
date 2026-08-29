/* Headless pacing simulator: a greedy player runs the real game logic at speed.
 * Usage: node sim/sim.js [days] */
'use strict';
require('../js/decimal.js');
require('../js/format.js');
require('../js/params.js');
require('../js/logic.js');

const DAYS = parseFloat(process.argv[2] || '45');
const L = Logic;

const s = L.newGame();
s.settings.autoProve = true;
s.settings.autoProveMult = 2;

const events = [];
let simT = 0;
function logEvent(msg) {
  events.push(`[${formatTime(simT).padStart(10)}] ${msg}`);
  console.log(events[events.length - 1]);
}

// ---- greedy strategy ----
const flags = {};
const conjCooldown = {};
function once(key, cond, msg) {
  if (!flags[key] && cond) { flags[key] = true; logEvent(msg); }
}

function strategize() {
  // click while production is dead (bootstrap) — a human clicks a few times/sec
  if (L.production(s).isZero()) {
    for (let i = 0; i < 3; i++) L.clickIncrement(s);
  }
  // unlock degrees
  while (s.degreesUnlocked <= P.MAX_DEGREE) {
    const c = L.degreeUnlockCost(s);
    if (!c || s.x.lt(c)) break;
    L.unlockDegree(s);
    once('deg' + s.degreesUnlocked, true, `degree ${s.degreesUnlocked - 1} term unlocked`);
  }
  // buy terms, highest degree first
  for (let n = s.degreesUnlocked - 1; n >= 0; n--) L.buyTerm(s, n, 'max');

  // prove manually until autoProve milestone kicks in
  if (!L.hasMilestone(s, 'autoProve') && !s.activeConj) {
    const g = L.lemmaGain(s);
    if (g.gte(s.lemmas.mul(2).max(1))) {
      L.prove(s);
      once('proof1', true, `first PROOF (total lemmas ${format(s.totalLemmas)})`);
    }
  }
  once('proof10', s.totalProofs >= 10, '10 proofs');
  once('proof40', s.totalProofs >= 40, '40 proofs (auto-prove milestone)');

  // lemma upgrades (round-robin greedy: buy any affordable)
  for (const d of P.LEMMA_UPGRADES) {
    // save for convergence once close
    if (!s.converged && s.degreesUnlocked >= P.CONVERGENCE_DEGREE
        && s.lemmas.lt(P.CONVERGENCE_COST * 2)) break;
    L.buyLemmaUp(s, d.id);
  }
  if (L.canConverge(s)) { L.buyConvergence(s); logEvent('CONVERGENCE — series → e^(βt)'); }
  if (s.converged) for (const d of P.ANALYSIS_UPGRADES) L.buyAnalysisUp(s, d.id);

  // once converged: farm lemmas briefly, then hold runs long to push for theorems
  if (s.converged) {
    if (s.totalTheorems.lt(1)) {
      // pre-first-theorem: stop proving once we have a lemma stockpile to spend
      s.settings.autoProve = s.lemmas.lt(P.CONVERGENCE_COST * 4);
      s.settings.autoProveMult = 3;
    } else {
      s.settings.autoProve = true;
      s.settings.autoProveMult = 3;
    }
  }

  // theorems: claim when the gain meaningfully grows current holdings
  if (L.canTheorem(s)) {
    const g = L.theoremGain(s);
    if (g.gte(s.theorems.mul(0.3).max(1))) {
      L.claimTheorem(s);
      once('thm1', true, `first THEOREM (gain ${format(g)})`);
    }
  }
  const thmPriority = ['keepLemmaUps', 'conjectures', 'fields', 'autoAnalysis',
                       'rigor', 'lemmaBoost', 'betaBoost'];
  for (const id of thmPriority) L.buyTheoremUp(s, id);
  once('conjUnlock', (s.theoremUps.conjectures || 0) > 0, 'conjectures unlocked');
  once('fieldsUnlock', (s.theoremUps.fields || 0) > 0, 'FIELDS unlocked');

  // conjectures: attempt when passive x growth would beat target quickly — proxy:
  // run one if our last non-conjecture peak exceeded 100x the target
  if ((s.theoremUps.conjectures || 0) > 0 && !s.activeConj) {
    for (const c of P.CONJECTURES) {
      const done = s.conjDone[c.id] || 0;
      if (done < c.max
          && (conjCooldown[c.id] || 0) < simT
          && Dec.pow10(s.stats.bestLog10Era).gte(L.conjTarget(s, c.id, done))) {
        L.startConjecture(s, c.id);
        break;
      }
    }
  }
  if (s.activeConj) {
    const c = P.CONJECTURES.find(v => v.id === s.activeConj);
    const done = s.conjDone[c.id] || 0;
    if (s.x.gte(L.conjTarget(s, c.id, done))) {
      L.prove(s);
      logEvent(`conjecture ${c.name} tier ${done + 1} complete`);
    } else if (s.t > 7200) {
      conjCooldown[c.id] = simT + 6 * 3600; // don't retry a failed conjecture for 6h
      L.exitConjecture(s);
    }
  }

  // fields
  if ((s.theoremUps.fields || 0) > 0) {
    for (const f of P.FIELDS) {
      if (!s.fieldsUnlocked[f.id] && s.theorems.gte(Dec.from(f.unlockCost).mul(2))) {
        L.unlockField(s, f.id);
        logEvent(`field unlocked: ${f.name}`);
      }
    }
    // activate the field with the least rho (round-robin growth)
    const unlocked = P.FIELDS.filter(f => s.fieldsUnlocked[f.id]);
    if (unlocked.length && s.activeFields.length === 0) L.setActiveField(s, unlocked[0].id);
    if (unlocked.length > 1 && Math.random() < 0.001) {
      const pick = unlocked[Math.floor(Math.random() * unlocked.length)];
      if (!s.activeFields.includes(pick.id)) L.setActiveField(s, pick.id);
    }
    for (const f of unlocked) {
      L.buyFieldUp(s, f.id, 'up');
      if (f.id === 'geometry') L.buyFieldUp(s, 'geometry', 'dim');
    }
  }

  if (L.canParadigm(s)) {
    L.doParadigm(s);
    logEvent(`PARADIGM SHIFT #${s.paradigms}`);
  }

  L.checkAchievements(s);
}

// ---- run ----
const totalSec = DAYS * 86400;
let nextSnapshot = 600;
let steps = 0;
const t0 = Date.now();
while (simT < totalSec) {
  const dt = Math.min(Math.max(1, simT / 2000), 120);
  L.tick(s, dt);
  simT += dt;
  steps++;
  if (steps % 5 === 0 || simT < 600) strategize();
  if (simT >= nextSnapshot) {
    nextSnapshot = nextSnapshot < 86400 ? nextSnapshot * 2 : nextSnapshot + 86400;
    const lg = s.x.isZero() ? 0 : s.x.log10();
    console.log(`  t=${formatTime(simT).padEnd(9)} x=1e${lg.toFixed(1).padStart(8)} ` +
      `best=1e${s.stats.bestLog10x.toFixed(0).padStart(6)} lem=${format(s.lemmas).padEnd(10)} ` +
      `prf=${s.totalProofs} thm=${format(s.totalTheorems)} rigorOoM=${L.rigorLog10(s).toFixed(0)} ` +
      `para=${s.paradigms}`);
  }
}
console.log(`\n--- ${DAYS} days simulated in ${((Date.now() - t0) / 1000).toFixed(1)}s (${steps} steps) ---`);
console.log(`final: best x = 1e${s.stats.bestLog10x.toFixed(0)}, proofs=${s.totalProofs}, ` +
  `theorems earned=${format(s.totalTheorems)}, paradigms=${s.paradigms}, ` +
  `achievements=${Object.keys(s.achievements).length}/${P.ACHIEVEMENTS.length}`);
console.log('\nEvent timeline:');
for (const e of events) console.log(e);
