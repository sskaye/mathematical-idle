/* UI: tabbed interface, event delegation, 4 Hz re-render of the active tab. */
'use strict';

(function (global) {

const L = () => global.Logic;
const S = () => global.Game.state;

// ---------- formatting helpers ----------

function fmt(x, d = 2) {
  const s = S();
  const dec = Dec.from(x);
  if (s.settings.notation === 'sci' && !dec.isZero() && dec.log10() >= 3) {
    if (dec.e < 1e6) return dec.m.toFixed(d) + 'e' + Math.round(dec.e);
    return format(dec, d);
  }
  if (s.settings.notation === 'log' && !dec.isZero() && dec.log10() >= 6) {
    return 'log:' + format(Dec.fromNumber(dec.log10()), 2);
  }
  return format(dec, d);
}

function sup(n) {
  const map = { 0:'⁰',1:'¹',2:'²',3:'³',4:'⁴',5:'⁵',6:'⁶',7:'⁷',8:'⁸',9:'⁹',10:'¹⁰' };
  return map[n] || `^${n}`;
}
const SUB = { 0:'₀',1:'₁',2:'₂',3:'₃',4:'₄',5:'₅',6:'₆',7:'₇',8:'₈',9:'₉',10:'₁₀' };

function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// ---------- tab registry ----------

const TABS = [
  { id: 'terms',    label: 'The Series' },
  { id: 'proofs',   label: 'Proofs',
    visible: s => s.stats.bestLog10x >= 4 || s.totalProofs > 0,
    tease:   s => s.stats.bestLog10x >= 3.5,
    badge:   s => L().canProve(s) ? '∎' : null },
  { id: 'analysis', label: 'Analysis',
    visible: s => s.converged || (s.stats.maxDegrees || 1) >= 6,
    tease:   s => (s.stats.maxDegrees || 1) >= 5,
    badge:   s => (!s.converged && L().canConverge(s)) ? '!' : null },
  { id: 'theorems', label: 'Theorems',
    visible: s => s.converged,
    badge:   s => L().canTheorem(s) && L().theoremGain(s).gte(s.theorems.max(1)) ? '∎' : null },
  { id: 'conjectures', label: 'Conjectures',
    visible: s => (s.theoremUps.conjectures || 0) > 0,
    tease:   s => s.converged,
    badge:   s => s.activeConj ? '…' : null },
  { id: 'fields',   label: 'Fields',
    visible: s => (s.theoremUps.fields || 0) > 0,
    tease:   s => s.theoremCount > 0 },
  { id: 'paradigm', label: 'Paradigm',
    visible: s => s.paradigms > 0 || s.stats.bestLog10x >= 500,
    tease:   s => s.stats.bestLog10x >= 300,
    badge:   s => L().canParadigm(s) ? '!' : null },
  { id: 'foundations', label: 'Foundations',
    visible: s => s.crises > 0 || s.paradigms >= 11,
    tease:   s => s.paradigms >= 9,
    badge:   s => L().canCrisis(s) ? '!' : (s.crises > 0 && !s.foundationChosen ? '?' : null) },
  { id: 'universes', label: 'Universes',
    visible: s => L().universeUnlocked(s),
    tease:   s => s.crises >= 2,
    badge:   s => s.activeUniverse ? '…' : null },
  { id: 'absolute', label: 'The Absolute',
    visible: () => false,
    tease:   s => s.truths >= 9 },
  { id: 'achievements', label: 'Mathematicians' },
  { id: 'notebook', label: 'Notebook',
    visible: s => s.totalProofs > 0 },
  { id: 'settings', label: 'Settings' },
];

let activeTab = 'terms';
let importAreaOpen = false;

// ---------- header ----------

// Length-stable formatting for the header: widths only change on exponent-digit
// rollovers, so the centered formula doesn't judder as numbers tick.
function fmtF(x, d = 2) {
  const dec = Dec.from(x);
  if (dec.isZero()) return '0';
  const lg = dec.log10();
  if (lg < 4) {
    const n = dec.toNumber();
    return Number.isInteger(n) ? String(n) : n.toFixed(d);
  }
  if (dec.e < 1e6) return dec.m.toFixed(d) + 'e' + Math.round(dec.e);
  return format(dec, d);
}

function setIfChanged(id, html) {
  const el = document.getElementById(id);
  if (el.__last !== html) { el.innerHTML = html; el.__last = html; }
}

function renderHeader() {
  const s = S();
  const prod = L().production(s);
  setIfChanged('x-display', `<i>x</i> = <b>${fmtF(s.x)}</b>`);
  const peak = s.runBestLog > 6 && s.runBestLog - (s.x.isZero() ? 0 : s.x.log10()) > 0.5
    ? ` · run peak ${fmtF(Dec.pow10(s.runBestLog))}` : '';
  const tDisp = s.t < 1e6 ? s.t.toFixed(1) : format(Dec.fromNumber(s.t), 2);
  setIfChanged('x-rate',
    `growing at ${fmtF(prod.mul(L().tSpeed(s)))}/s · t = ${tDisp}` +
    (L().tSpeed(s) !== 1 ? ` (t-speed ×${L().tSpeed(s).toFixed(2)})` : '') + peak +
    (s.crises > 0 ? ` · ${L().ordinalLabel(s)}` : ''));
  renderFormula();
}

// Partial sum of Σ 1/n! over the first `deg` terms — the road to e
function ePartial(deg) {
  let sum = 0, fact = 1;
  for (let n = 0; n < deg; n++) { if (n > 0) fact *= n; sum += 1 / fact; }
  return sum;
}

function renderFormula() {
  const s = S();
  const parts = [];
  for (let n = 0; n < s.degreesUnlocked && n <= P.MAX_DEGREE; n++) {
    const lv = s.termLevels[n];
    const label = lv > 0
      ? fmtF(Dec.pow10(Math.log10(lv) + Math.floor(lv / L().effMilestone(s)) * Math.log10(2)))
      : '0';
    if (n === 0) parts.push(label);
    else if (n === 1) parts.push(`${label}·t`);
    else parts.push(`${label}·<span class="frac"><span class="top">t${sup(n)}</span><span class="bot">${n}!</span></span>`);
    if (parts.length >= 6 && n < s.degreesUnlocked - 1) { parts.push('⋯'); break; }
  }
  const mult = L().prodMult(s);
  const b = L().beta(s);
  let html = `ẋ = <span class="mult">${fmtF(mult)}</span>`;
  if (s.converged) {
    html += b > 0
      ? ` · <span class="expf">e<sup>${b.toPrecision(3)}·t</sup></span>`
      : ` · <span class="expf muted">e<sup>0·t</sup></span>`;
  }
  html += ` · ( ${parts.join(' + ')} )`;
  if (s.activeConj) html += ` <span class="muted">[${esc(P.CONJECTURES.find(c => c.id === s.activeConj).name)} — elementary methods]</span>`;
  if (s.activeUniverse) html += ` <span class="muted">[in ${esc(P.UNIVERSES.find(v => v.id === s.activeUniverse).name)}]</span>`;
  setIfChanged('formula-banner', html);
}

// ---------- tab content renderers ----------

function upgradeRowsHTML(defs, table, currencyName, currencyVal, buyAction) {
  const s = S();
  return defs.map(d => {
    const lv = s[table][d.id] || 0;
    const maxed = lv >= d.max;
    const cost = maxed ? null : L().upgradeCost(d, lv);
    const afford = cost && currencyVal.gte(cost);
    return `<div class="upgrade-row">
      <div>
        <div class="upgrade-name">${esc(d.name)} <span class="muted small">${lv}${d.max > 1 && d.max < 900 ? '/' + d.max : ''}</span></div>
        <div class="upgrade-desc">${esc(d.desc)}</div>
      </div>
      <span class="term-buy">
        <button data-action="${buyAction}" data-id="${d.id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? 'MAX' : fmt(cost) + ' ' + currencyName}
        </button>
        ${!maxed && d.max > 1 ? `<button data-action="${buyAction}" data-id="${d.id}" data-count="max" ${afford ? '' : 'disabled'}>Max</button>` : ''}
      </span>
    </div>`;
  }).join('');
}

function tabTerms() {
  const s = S();
  const rows = [];
  for (let n = 0; n < s.degreesUnlocked && n <= P.MAX_DEGREE; n++) {
    const lv = s.termLevels[n];
    const cost = L().termCost(s, n);
    const afford = s.x.gte(cost);
    const mile = L().effMilestone(s);
    const mCount = Math.floor(lv / mile);
    const toNext = mile - (lv % mile);
    const buyMax = L().hasMilestone(s, 'buymax');
    const suppressed = (s.activeConj === 'goldbach' && n % 2 === 1)
      || (s.activeConj === 'pvsnp' && n !== s.degreesUnlocked - 1);
    rows.push(`<div class="term-row"${suppressed ? ' style="opacity:0.35" title="Suppressed by the active conjecture"' : ''}>
      <span class="term-math">a<sub>${n}</sub>${n === 0 ? '' : (n === 1 ? '·t' : `·t<sup>${n}</sup>/${n}!`)}</span>
      <span class="term-info">
        <span class="level-tag">lvl ${formatInt(lv)}</span>
        ${mCount > 0 ? `<span class="milestone-tag">×${format(Dec.pow10(mCount * Math.log10(2)), 0)} milestone</span>` : ''}
        <span class="muted"> · next ×2 in ${toNext}</span>
      </span>
      <span class="term-buy">
        <button data-action="buyTerm" data-n="${n}" ${afford ? '' : 'disabled'}>Buy · ${fmt(cost)}</button>
        ${buyMax ? `<button data-action="buyTermMax" data-n="${n}">Max</button>` : ''}
      </span>
    </div>`);
  }
  const degCost = L().degreeUnlockCost(s);
  const clickAdd = L().production(s).mul(P.CLICK_FRACTION).max(1);
  return `
    <div class="card">
      <h3>Taylor Terms</h3>
      <div class="desc">Each term aₙ·tⁿ/n! adds to the growth rate ẋ. Higher degrees are weak at first but
      dominate as t grows — and t resets when you complete a proof. Every ${L().effMilestone(s)} levels of a term doubles it.</div>
      ${rows.join('')}
    </div>
    ${degCost !== null ? `<div class="card">
      <h3>Unlock the t${sup(s.degreesUnlocked)} term</h3>
      <div class="desc">Extend the series with a degree-${s.degreesUnlocked} term.</div>
      ${s.degreesUnlocked >= 2 ? (() => {
        const cur = ePartial(s.degreesUnlocked);
        const next = ePartial(s.degreesUnlocked + 1);
        const E = Math.E;
        const gapText = E - cur > 1e-12
          ? `within <b>${(E - cur).toPrecision(3)}</b> of ${s.converged ? 'e' : 'a certain famous constant, e'} = ${E.toFixed(7)}…
             The next term closes ${(100 * (1 - (E - next) / (E - cur))).toFixed(0)}% of the gap.`
          : `indistinguishable from e = ${E.toFixed(7)}… at this precision.`;
        return `<div class="desc">At t = 1, your series sums to <b>${cur.toFixed(7)}</b> — ${gapText}</div>`;
      })() : ''}
      <button class="primary" data-action="unlockDegree" ${s.x.gte(degCost) ? '' : 'disabled'}>Unlock · ${fmt(degCost)}</button>
    </div>` : ''}
    <div class="card">
      <h3>By Hand</h3>
      <div class="desc">The successor function: the primitive act of mathematics.</div>
      <button data-action="click">Increment (+${fmt(clickAdd)})</button>
    </div>`;
}

function tabProofs() {
  const s = S();
  const gain = L().lemmaGain(s);
  const can = L().canProve(s);
  const conj = s.activeConj ? P.CONJECTURES.find(c => c.id === s.activeConj) : null;
  const conjDone = conj ? (s.conjDone[conj.id] || 0) : 0;
  const conjTarget = conj ? L().conjTarget(s, conj.id, conjDone) : null;
  const conjMet = conj && Dec.pow10(s.runBestLog).gte(conjTarget);
  const exp = L().lemmaExponent(s);
  const milestones = P.PROOF_MILESTONES.map(m =>
    `<li class="${s.totalProofs >= m.at ? 'done' : ''}">${m.at} proofs — ${esc(m.desc)}</li>`).join('');
  return `
    ${conj ? `<div class="conj-active-banner">
      <b>Conjecture in progress: ${esc(conj.name)}</b> — ${esc(conj.desc)}<br>
      Target: reach x = ${fmt(conjTarget)} (peak so far: ${fmt(Dec.pow10(s.runBestLog))})
      ${conjMet ? '— <b>target met!</b> Complete it with Q.E.D.' : ''}
      <div style="margin-top:6px"><button data-action="exitConj">Abandon attempt</button></div>
    </div>` : ''}
    <div class="card">
      <h3>Write It Up</h3>
      <div class="desc">Completing a proof resets x, t, and your terms — but the insight remains as
      <b>Lemmas</b>. Lemma gain = (peak x this run / 10⁶)<sup>${exp.toFixed(2)}</sup> — spending x
      can never shrink it. Lemmas multiply production
      ((1+lemmas)<sup>${P.LEMMA_EFFECT_POW}</sup>) and buy the upgrades below.</div>
      <div>You hold <b>${fmt(s.lemmas)}</b> lemmas <span class="muted">(${s.proofs} proofs this era, ${s.totalProofs} ever)</span></div>
      <button class="primary big-action" data-action="prove" title="Hold to repeat" ${can ? '' : 'disabled'}>
        <span class="qed-symbol">∎</span> Q.E.D. ${can ? `— gain ${fmt(gain)} lemmas` : `(requires x ≥ ${fmt(P.PROOF_REQ)})`}
        ${conjMet ? ' + complete ' + esc(conj.name) : ''}
      </button>
      ${L().hasMilestone(s, 'autoProve') ? `
        <div class="small" style="margin-top:6px">
          <label><input type="checkbox" data-setting="autoProve" ${s.settings.autoProve ? 'checked' : ''}>
          Auto-prove when gain ≥ </label>
          <input type="number" data-setting="autoProveMult" value="${s.settings.autoProveMult}" min="1.1" step="0.5" style="width:70px">
          × current lemmas
        </div>` : ''}
    </div>
    <div class="card">
      <h3>Lemma Upgrades</h3>
      ${upgradeRowsHTML(P.LEMMA_UPGRADES, 'lemmaUps', 'lemmas', s.lemmas, 'buyLemmaUp')}
    </div>
    <div class="card">
      <h3>Milestones <span class="muted small">(permanent, survive every reset)</span></h3>
      <ul class="milestone-list">${milestones}</ul>
    </div>`;
}

function tabAnalysis() {
  const s = S();
  if (!s.converged) {
    const cur = ePartial(s.degreesUnlocked);
    return `<div class="card">
      <h3>Convergence</h3>
      <div class="desc">Your Taylor series is the beginning of something: with every degree it looks more
      like <i>e</i><sup>t</sup> = Σ tⁿ/n!. At t = 1 your ${s.degreesUnlocked}-term series sums to
      <b>${cur.toFixed(7)}</b>; e = ${Math.E.toFixed(7)}… — off by ${(Math.E - cur).toPrecision(3)}.
      Unlock ${P.CONVERGENCE_DEGREE} degrees in a single proof era and spend
      ${format(P.CONVERGENCE_COST)} lemmas to take the limit — permanently attaching an
      exponential factor e<sup>βt</sup> to your growth rate.</div>
      <div>Degrees unlocked: <b>${s.degreesUnlocked}</b> / ${P.CONVERGENCE_DEGREE} ·
           Lemmas: <b>${fmt(s.lemmas)}</b> / ${format(P.CONVERGENCE_COST)}</div>
      <button class="primary big-action" data-action="converge" ${L().canConverge(s) ? '' : 'disabled'}>
        lim<sub>n→∞</sub> Σ aₖtᵏ/k! — Converge the series
      </button>
    </div>`;
  }
  const b = L().beta(s);
  const rig = L().rigorLog10(s);
  const curSum = ePartial(s.degreesUnlocked);
  return `
    <div class="card">
      <h3>The Exponential Era</h3>
      <div class="desc">The series converged: growth is now exponential, ẋ ∝ e<sup>βt</sup>.
      (Your current ${s.degreesUnlocked}-term partial sum at t = 1: ${curSum.toFixed(7)},
      vs e = ${Math.E.toFixed(7)}… — the limit you took lives in the exponential factor now.)</div>
      <div class="desc">
      β is built from the upgrades below — every point of β makes log₁₀(x) grow ~${(1/Math.LN10*0.001*100).toFixed(2)} orders
      of magnitude per second per unit of t-speed. Long runs are now valuable: t compounds.</div>
      <div>β = <b>${b.toPrecision(4)}</b>
      ${rig > 0 ? `<span class="muted">(includes ×${(1 + rig / 1000).toFixed(2)} from Fields rigor)</span>` : ''}
      ${(s.theoremUps.betaBoost || 0) > 0 ? `<span class="muted">(×${Math.pow(1.3, s.theoremUps.betaBoost).toFixed(2)} from Asymptotics)</span>` : ''}</div>
    </div>
    <div class="card">
      <h3>Analysis Upgrades <span class="muted small">(cost lemmas${(s.theoremUps.autoAnalysis || 0) > 0 ? ' · autobought' : ''})</span></h3>
      ${upgradeRowsHTML(P.ANALYSIS_UPGRADES, 'analysisUps', 'lemmas', s.lemmas, 'buyAnalysisUp')}
    </div>`;
}

function tabTheorems() {
  const s = S();
  const gain = L().theoremGain(s);
  const can = L().canTheorem(s);
  const lg = s.runBestLog;
  return `
    <div class="card">
      <h3>Claim a Theorem</h3>
      <div class="desc">A Theorem consolidates an era of proofs: it resets your proofs and lemmas${(s.theoremUps.keepLemmaUps || 0) > 0 || s.paradigms >= 1 ? '' : ', plus your lemma and analysis upgrades'} —
      granting <b>Theorems</b>, the currency of deep results.
      Gain = (log₁₀(x) / ${P.THEOREM_REQ_LOG10})<sup>${(P.THEOREM_POW + (s.paradigms >= 2 ? 0.1 : 0)).toFixed(1)}</sup>.</div>
      <div>You hold <b>${fmt(s.theorems)}</b> theorems <span class="muted">(${fmt(s.totalTheorems)} ever, ${s.theoremCount} claims)</span></div>
      <div class="small muted">log₁₀(peak x this run) = ${lg.toFixed(1)} — need ≥ ${P.THEOREM_REQ_LOG10}</div>
      <button class="primary big-action" data-action="claimTheorem" ${can ? '' : 'disabled'}>
        Claim Theorem ${can ? `— gain ${fmt(gain)}` : `(reach x ≥ 1e${P.THEOREM_REQ_LOG10})`}
      </button>
      ${s.paradigms >= 1 ? `
        <div class="small" style="margin-top:6px">
          <label><input type="checkbox" data-setting="autoTheorem" ${s.settings.autoTheorem ? 'checked' : ''}>
          Auto-claim when gain ≥ 2× current theorems</label>
        </div>` : ''}
    </div>
    <div class="card">
      <h3>Theorem Upgrades</h3>
      ${upgradeRowsHTML(P.THEOREM_UPGRADES, 'theoremUps', 'thm', s.theorems, 'buyTheoremUp')}
    </div>`;
}

function tabConjectures() {
  const s = S();
  const cards = P.CONJECTURES.map(c => {
    const done = s.conjDone[c.id] || 0;
    const finished = done >= c.max;
    const target = finished ? null : L().conjTarget(s, c.id, done);
    const dots = Array.from({ length: c.max }, (_, i) => i < done ? '●' : '○').join(' ');
    return `<div class="card">
      <h3>${esc(c.name)} <span class="muted small">${dots}</span></h3>
      <div class="desc"><b>Restriction:</b> ${esc(c.desc)}<br><b>Reward:</b> ${esc(c.rewardDesc)}</div>
      ${finished ? '<div class="muted">Proved in full. ∎</div>' :
        `<div class="small">Tier ${done + 1} target: reach x = <b>${fmt(target)}</b></div>
         <button data-action="startConj" data-id="${c.id}" ${s.activeConj ? 'disabled' : ''}>Attempt</button>`}
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="desc">Conjectures are proof runs under a restriction, by <b>elementary methods</b> —
      the exponential factor e<sup>βt</sup> is disabled; only your polynomial and multipliers work.
      ${s.paradigms >= 5
        ? 'Paradigm 5: attempts ride along with your normal run and complete themselves at the target.'
        : 'Starting one resets your current run.'}
      Targets scale with the best x of your current theorem era. Rewards are permanent${s.paradigms >= 4 ? ' — and Paradigm 4 makes every completion count double' : ''}.</div>
    </div>
    <div class="grid2">${cards}</div>`;
}

function fieldCard(f) {
  const s = S();
  const fs = s.fieldState[f.id];
  const unlocked = !!s.fieldsUnlocked[f.id];
  const active = s.activeFields.includes(f.id);
  if (!unlocked) {
    const cost = Dec.from(f.unlockCost);
    return `<div class="card">
      <h3>${esc(f.name)}</h3>
      <div class="desc">${esc(f.desc)}</div>
      <button class="primary" data-action="unlockField" data-id="${f.id}"
        ${s.theorems.gte(cost) ? '' : 'disabled'}>Found the field · ${fmt(cost)} thm</button>
    </div>`;
  }
  let vis = '', ups = '';
  const upCost = L().fieldUpCost(s, f.id);
  if (f.id === 'geometry') {
    const dimCost = L().geoDimCost(s);
    vis = `side s = ${fs.side.toFixed(2)} · dimension n = ${fs.dims} · volume sⁿ = ${fmt(Dec.pow10(fs.dims * Math.log10(Math.max(fs.side, 1e-9))))} ρ/s`;
    ups = `<button data-action="fieldUp" data-id="geometry" ${upCost && s.theorems.gte(upCost) ? '' : 'disabled'}>Grow faster · ${fmt(upCost)} thm</button>
           ${dimCost ? `<button data-action="fieldDim" ${s.theorems.gte(dimCost) ? '' : 'disabled'}>+1 dimension · ${fmt(dimCost)} thm</button>` : '<span class="muted small">max dimensions</span>'}`;
  } else if (f.id === 'numtheory') {
    const lastP = fs.primeIdx > 0 ? formatInt(L().nthPrime(fs.primeIdx - 1)) : '—';
    vis = `primes found: ${formatInt(fs.primeIdx)} (last: ${lastP}) · primorial ≈ 1e${format(Dec.fromNumber(fs.logProd), 1)} ρ/s · next prime in ~${formatTime(Math.max(0, fs.nextIn) / Math.pow(2, fs.speedUp))}`;
    ups = `<button data-action="fieldUp" data-id="numtheory" ${upCost && s.theorems.gte(upCost) ? '' : 'disabled'}>Sieve 2× faster · ${fmt(upCost)} thm</button>`;
  } else if (f.id === 'combinatorics') {
    vis = `n = ${formatInt(fs.n)} · n! ≈ ${fmt(Dec.pow10(fs.n <= 20 ? Math.log10(factApprox(fs.n)) : stirlingLog10(fs.n)))} ρ/s`;
    ups = `<button data-action="fieldUp" data-id="combinatorics" ${upCost && s.theorems.gte(upCost) ? '' : 'disabled'}>Count 2× faster · ${fmt(upCost)} thm</button>`;
  } else if (f.id === 'chaos') {
    const r = P.CHAOS.rBase + P.CHAOS.rStep * fs.rLevel;
    vis = `r = ${r.toFixed(2)} · orbit = ${fs.orbit.toFixed(4)} · best ${fs.best.toFixed(4)}`;
    ups = upCost ? `<button data-action="fieldUp" data-id="chaos" ${s.theorems.gte(upCost) ? '' : 'disabled'}>Push r deeper · ${fmt(upCost)} thm</button>` : '<span class="muted small">fully chaotic</span>';
  } else if (f.id === 'algebra') {
    const last = fs.idx > 0 ? L().groupAt(fs.idx - 1) : null;
    const next = L().groupAt(fs.idx);
    const interval = P.ALG.baseInterval * Math.pow(P.ALG.intervalR, fs.idx);
    const remain = Math.max(0, interval - fs.progress) / Math.pow(2, fs.speedUp);
    vis = `classified: ${formatInt(fs.idx)}${last ? ` (latest: ${esc(last.name)}, order ≈ 1e${last.logOrder.toFixed(1)})` : ''}` +
          ` · next: ${esc(next.name)} in ~${formatTime(remain)}`;
    ups = `<button data-action="fieldUp" data-id="algebra" ${upCost && s.theorems.gte(upCost) ? '' : 'disabled'}>Classify 2× faster · ${fmt(upCost)} thm</button>`;
  } else if (f.id === 'logic') {
    vis = `encoding fraction ${L().logicFraction(s).toFixed(2)} · Σ log₁₀ρ of other fields → ρ gain ≈ 1e${L().logicExponent(s).toFixed(0)}/s`;
    ups = upCost ? `<button data-action="fieldUp" data-id="logic" ${s.theorems.gte(upCost) ? '' : 'disabled'}>Deepen the encoding · ${fmt(upCost)} thm</button>` : '<span class="muted small">maximally self-referential</span>';
  }
  return `<div class="card">
    <h3>${esc(f.name)}
      <span class="chip ${active ? 'on' : ''}" data-action="toggleField" data-id="${f.id}" style="cursor:pointer">${active ? 'ACTIVE' : 'idle'}</span>
    </h3>
    <div class="desc">${esc(f.desc)}</div>
    <div class="field-vis">${vis}</div>
    <div class="field-vis">rigor ρ = <b>${fmt(fs.rho)}</b> <span class="muted">(weight ${P.FIELD_WEIGHT[f.id]})</span></div>
    ${ups}${upCost ? ` <button data-action="fieldUpMax" data-id="${f.id}" ${s.theorems.gte(upCost) ? '' : 'disabled'}>Max</button>` : ''}
  </div>`;
}
function factApprox(n) { let v = 1; for (let i = 2; i <= n; i++) v *= i; return v; }
function stirlingLog10(n) { return (n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n)) / Math.LN10; }

function tabFields() {
  const s = S();
  const rig = L().rigorLog10(s);
  return `
    <div class="card">
      <h3>Rigor</h3>
      <div class="desc">Each Field accrues rigor ρ while <b>active</b> (${L().maxActiveFields(s)} at a time${s.paradigms >= 3 ? ' — Paradigm III' : ''}).
      Total rigor multiplies β: currently <b>×${(1 + rig / 1000).toFixed(3)}</b>
      (Σ weight·log₁₀(ρ)<sup>${P.RIGOR_DAMP}</sup> = ${rig.toFixed(1)}). Fields never reset.</div>
    </div>
    <div class="grid2">${P.FIELDS.map(fieldCard).join('')}</div>`;
}

function tabParadigm() {
  const s = S();
  const req = L().paradigmReqLog10(s);
  const cur = s.runBestLog;
  const pct = Math.min(100, cur / req * 100);
  const effects = P.PARADIGM_EFFECTS.map((e, i) =>
    `<li class="${s.paradigms > i ? 'done' : ''}">Paradigm ${i + 1}: ${esc(e)}</li>`).join('');
  return `
    <div class="card">
      <h3>Paradigm Shift ${s.paradigms > 0 ? `<span class="muted small">(${s.paradigms} so far)</span>` : ''}</h3>
      <div class="desc">The deepest reset: everything below — theorems, lemmas, upgrades — is
      subsumed into a new way of seeing. Each shift multiplies production ×1,000 permanently, grants a
      rule-changing effect, and seeds your next era with 10<sup>${8 * (s.paradigms + 1)}</sup> lemmas.
      Milestones, achievements, conjecture rewards, and Fields persist.
      ${s.paradigms > 0 ? `The next shift demands <b>double</b> the exponent of your last (you shifted at 1e${Math.round(s.lastParadigmLog)}).` : ''}</div>
      <div class="small">log₁₀(peak x this run) = <b>${format(Dec.fromNumber(cur), 1)}</b> / required ${format(Dec.fromNumber(req), 1)}</div>
      <div class="progress-outer" style="margin:8px 0"><div class="progress-inner accent" style="width:${pct}%"></div></div>
      <button class="primary big-action" data-action="paradigm" ${L().canParadigm(s) ? '' : 'disabled'}>
        Shift the Paradigm
      </button>
      ${s.crises >= 2 ? `<div class="small">
        <label><input type="checkbox" data-setting="autoParadigm" ${s.settings.autoParadigm ? 'checked' : ''}>
        Auto-shift when available <span class="muted">(ω·2 milestone)</span></label>
      </div>` : ''}
      <ul class="milestone-list">${effects}
        <li class="${s.paradigms > P.PARADIGM_EFFECTS.length ? 'done' : ''}">Paradigm ${P.PARADIGM_EFFECTS.length + 1}+: ??? <span class="muted">(further shifts keep compounding)</span></li>
      </ul>
    </div>`;
}

function tabAchievements() {
  const s = S();
  const n = Object.keys(s.achievements).length;
  const cards = P.ACHIEVEMENTS.map(a => `
    <div class="ach-card ${s.achievements[a.id] ? 'earned' : ''}">
      <div class="ach-name">${esc(a.name)}</div>
      <div class="ach-desc">${esc(a.desc)}</div>
    </div>`).join('');
  return `
    <div class="card">
      <h3>Mathematicians <span class="muted small">${n}/${P.ACHIEVEMENTS.length}</span></h3>
      <div class="desc">Each honored name grants ×${P.ACHIEVEMENT_MULT} production, permanently
      (currently ×${Math.pow(P.ACHIEVEMENT_MULT, n).toFixed(2)}).</div>
    </div>
    <div class="ach-grid">${cards}</div>`;
}

function tabSettings() {
  const s = S();
  const st = s.stats;
  return `
    <div class="card">
      <h3>Display</h3>
      <label>Notation:
        <select data-setting="notation">
          <option value="auto" ${s.settings.notation === 'auto' ? 'selected' : ''}>Adaptive (plain → scientific → ee)</option>
          <option value="sci" ${s.settings.notation === 'sci' ? 'selected' : ''}>Scientific</option>
          <option value="log" ${s.settings.notation === 'log' ? 'selected' : ''}>Logarithmic</option>
        </select>
      </label>
      &nbsp;&nbsp;
      <label>Theme:
        <select data-setting="theme">
          <option value="">System</option>
          <option value="light" ${document.documentElement.dataset.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${document.documentElement.dataset.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </label>
    </div>
    <div class="card">
      <h3>Save</h3>
      <button data-action="saveNow">Save now</button>
      <button data-action="exportSave">Export to clipboard</button>
      <button data-action="showImport">Import…</button>
      <button data-action="wipe" style="color:var(--accent)">Hard reset</button>
      <div id="import-area" ${importAreaOpen ? '' : 'hidden'} style="margin-top:8px">
        <textarea id="import-text" placeholder="Paste save string"></textarea>
        <button data-action="doImport">Load</button>
      </div>
      <div class="small muted" style="margin-top:6px">Autosaves every ${P.AUTOSAVE_MS / 1000}s. Offline progress is simulated at full rate (up to ${P.OFFLINE_CAP_HOURS / 24} days).</div>
    </div>
    <div class="card">
      <h3>The Record</h3>
      <div class="small">
        Best x ever: <b>${fmt(st.bestX)}</b><br>
        Lifetime lemmas: ${fmt(st.lifetimeLemmas)} · Proofs: ${formatInt(s.totalProofs)} ·
        Theorems earned: ${fmt(s.totalTheorems)} · Paradigms: ${s.paradigms}<br>
        Playtime: ${formatTime(st.playtime)} · Began: ${new Date(st.created).toLocaleDateString()}
      </div>
    </div>
    <div class="card">
      <h3>How to Play</h3>
      <div class="small muted">
        <p><b>The Series</b>: your growth rate ẋ is a Taylor polynomial in t (time since last proof).
        Buy term levels with x; unlock higher degrees. High-degree terms need large t to shine —
        proofs reset t, so timing matters.</p>
        <p><b>Proofs (∎ Q.E.D.)</b>: reset the run for Lemmas, which boost production and buy upgrades.
        Prove often early; each proof should roughly double your lemmas or better.</p>
        <p><b>Convergence</b>: unlock ${P.CONVERGENCE_DEGREE} degrees at once and the series converges to an
        exponential — the heart of Act II. From then on long runs compound.</p>
        <p><b>Theorems</b>: the second reset layer, earned from the exponent of x. Spend on
        permanent-feeling power; "Collected Works" makes theorem resets painless.</p>
        <p><b>Conjectures</b>: challenge runs with the exponential disabled. <b>Fields</b>: idle engines
        with different growth shapes; their rigor multiplies β. <b>Paradigms</b>: the deepest reset —
        each demands double the exponent of the last, and each changes a rule.</p>
        <p><b>Foundations (Act IV)</b>: at 12 paradigms, the Crisis converts paradigms to Axioms and
        you choose an axiom system whose rules last until the next Crisis. The ordinal ladder grants
        automation. <b>Universes (Act V)</b>: crisis into modified universes and collapse them into
        permanent Truths.</p>
        <p><b>Hotkeys</b>: <code>p</code> proves, <code>t</code> claims a theorem, <code>Esc</code> closes dialogs.
        Hold the Q.E.D. or Increment buttons to repeat. Prestige gains are based on your <i>peak</i> x
        this run — spending x never costs you lemmas or theorems.</p>
      </div>
    </div>
    <div class="footer-note">Q.E.D. — a mathematical idle. Numbers rest on a mantissa/exponent
    core good to 1e(9×10¹⁵).</div>`;
}

function tabNotebook() {
  const s = S();
  const entries = P.NOTEBOOK.map(e => {
    const open = e.when(s);
    if (!open) return `<div class="card" style="opacity:0.45"><h3>· · ·</h3></div>`;
    return `<div class="card"><h3>${esc(e.title)}</h3><div class="desc" style="font-style:italic">${esc(e.text)}</div></div>`;
  });
  // show all unlocked plus the next two locked placeholders
  let lastOpen = -1;
  P.NOTEBOOK.forEach((e, i) => { if (e.when(s)) lastOpen = Math.max(lastOpen, i); });
  const shown = entries.slice(0, Math.min(entries.length, lastOpen + 3));
  return `<div class="card"><div class="desc">Marginalia from the working mathematician. Entries appear as the work does.</div></div>` +
    shown.join('');
}

function tabFoundations() {
  const s = S();
  const req = L().crisisReq(s);
  const can = L().canCrisis(s);
  const ordinal = L().ordinalLabel(s);
  const ladder = P.ORDINALS.map((o, i) => {
    const reached = s.crises > i;
    return `<li class="${reached ? 'done' : ''}">${o.label}${o.milestone ? ` — ${esc(o.milestone)}` : ''}</li>`;
  }).join('');
  const fdnCards = s.crises > 0 ? P.FOUNDATIONS.map(f => {
    const active = s.foundation === f.id;
    const canPick = !s.foundationChosen;
    return `<div class="card" ${active ? 'style="border-color:var(--accent)"' : ''}>
      <h3>${esc(f.name)} ${active ? '<span class="chip on">FOUNDED</span>' : ''}</h3>
      <div class="desc"><i>${esc(f.tagline)}</i><br>${esc(f.desc)}</div>
      ${canPick ? `<button class="primary" data-action="chooseFoundation" data-id="${f.id}">Adopt these axioms</button>`
                : (active ? '' : '<span class="muted small">changeable at the next Crisis</span>')}
    </div>`;
  }).join('') : '';
  return `
    <div class="card">
      <h3>The Crisis of Foundations ${ordinal ? `<span class="muted small">— consistency strength ${ordinal}</span>` : ''}</h3>
      <div class="desc">Logic encodes every field, including itself — and a tower that describes itself
      carries a letter from Russell. A Crisis collapses everything above the fields: paradigms become
      <b>Axioms</b>, and mathematics must be refounded. Fields, conjecture rewards, milestones, and
      achievements survive. Each Crisis climbs the ordinal ladder and demands ${P.CRISIS_REQ_STEP} more paradigms.</div>
      <div>You hold <b>${fmt(s.axioms)}</b> axioms <span class="muted">(${s.crises} crises)</span></div>
      <div class="small">Paradigms: <b>${s.paradigms}</b> / ${req} required</div>
      <button class="primary big-action" data-action="crisis" ${can ? '' : 'disabled'}>
        Precipitate the Crisis ${can ? `— gain ${L().crisisGain(s)} axioms` : `(needs ${req} paradigms)`}
      </button>
      ${!s.foundationChosen && s.crises > 0 ? '<div class="conj-active-banner"><b>The foundation is unset.</b> Choose an axiom system below — its rules apply until the next Crisis.</div>' : ''}
    </div>
    ${fdnCards ? `<div class="grid2">${fdnCards}</div>` : ''}
    ${s.crises > 0 ? `<div class="card" style="margin-top:12px">
      <h3>Axiom Upgrades <span class="muted small">(permanent, survive everything)</span></h3>
      ${upgradeRowsHTML(P.AXIOM_UPGRADES, 'axiomUps', 'axioms', s.axioms, 'buyAxiomUp')}
    </div>` : ''}
    <div class="card">
      <h3>The Ordinal Ladder</h3>
      <ul class="milestone-list">${ladder}</ul>
    </div>`;
}

function tabUniverses() {
  const s = S();
  const cards = P.UNIVERSES.map(v => {
    const done = !!s.universes[v.id];
    const active = s.activeUniverse === v.id;
    const canEnter = L().canEnterUniverse(s, v.id);
    const locked = v.id === 'ultimatel' && P.UNIVERSES.some(w => w.id !== 'ultimatel' && !s.universes[w.id]);
    return `<div class="card" ${active ? 'style="border-color:var(--accent)"' : ''}>
      <h3>${esc(v.name)} ${done ? '<span class="chip on">COLLAPSED</span>' : (active ? '<span class="chip on">INSIDE</span>' : '')}</h3>
      <div class="desc">${esc(v.desc)}</div>
      <div class="small">Reach <b>${L().universeTarget(s, v.id)} paradigms</b> inside · reward: <b>${v.truths} Truth${v.truths > 1 ? 's' : ''}</b></div>
      ${done ? '' : active
        ? `<div class="small">Paradigms: <b>${s.paradigms}</b> / ${L().universeTarget(s, v.id)}
             ${s.activeUniverse === 'forcing' && s.forcingRule ? ` · current forcing: <b>${esc(P.CONJECTURES.find(c => c.id === s.forcingRule).name)}</b>` : ''}</div>
           <button data-action="abandonUniverse">Abandon this universe</button>`
        : locked ? '<span class="muted small">Collapse the other four universes first.</span>'
        : `<button class="primary" data-action="enterUniverse" data-id="${v.id}" ${canEnter ? '' : 'disabled'}>
             Crisis into this universe ${canEnter ? '' : `(needs ${P.UNIVERSE_ENTRY_REQ} paradigms)`}</button>`}
    </div>`;
  }).join('');
  return `
    <div class="card">
      <h3>The Set-Theoretic Multiverse <span class="muted small">${s.truths} Truths (×1e${P.TRUTH_PROD_EXP * s.truths} production)</span></h3>
      <div class="desc">A universe is a Crisis taken sideways: the same collapse, but you land somewhere
      with different rules. Reach the target paradigm count inside one and it collapses into permanent
      <b>Truths</b>. Entering needs only ${P.UNIVERSE_ENTRY_REQ} paradigms (a sideways crisis: you gain
      axioms as usual, but the ordinal ladder does not advance). No frontier Crisis while inside.</div>
    </div>
    <div class="grid2">${cards}</div>`;
}

const TAB_RENDERERS = {
  terms: tabTerms, proofs: tabProofs, analysis: tabAnalysis, theorems: tabTheorems,
  conjectures: tabConjectures, fields: tabFields, paradigm: tabParadigm,
  foundations: tabFoundations, universes: tabUniverses,
  achievements: tabAchievements, notebook: tabNotebook, settings: tabSettings,
};

// ---------- tab bar ----------

let lastTabbarHTML = '';

function renderTabbar() {
  const s = S();
  const bar = document.getElementById('tabbar');
  const html = TABS.map(t => {
    const vis = !t.visible || t.visible(s);
    const tease = !vis && t.tease && t.tease(s);
    if (!vis && !tease) return '';
    if (tease) return `<button class="tab-btn locked" disabled>???</button>`;
    const badge = t.badge && t.badge(s);
    return `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
      ${esc(t.label)}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  }).join('');
  if (html !== lastTabbarHTML) {
    morphTemplate.innerHTML = html;
    morphChildren(bar, morphTemplate);
    lastTabbarHTML = html;
  }
}

// ---------- modal & toasts ----------

function modal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div id="modal-box">${html}
    <div style="text-align:right;margin-top:12px"><button data-action="closeModal" class="primary">Continue</button></div></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

function toast(title, body) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="t-title">${esc(title)}</div><div class="small">${esc(body)}</div>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ---------- actions ----------

const ACTIONS = {
  click() { L().clickIncrement(S()); },
  buyTerm(el) { L().buyTerm(S(), +el.dataset.n, 1); },
  buyTermMax(el) { L().buyTerm(S(), +el.dataset.n, 'max'); },
  unlockDegree() { L().unlockDegree(S()); },
  prove() {
    const s = S();
    const hadConj = s.activeConj;
    const before = hadConj ? (s.conjDone[hadConj] || 0) : 0;
    if (L().prove(s) && hadConj && (s.conjDone[hadConj] || 0) > before) {
      const c = P.CONJECTURES.find(v => v.id === hadConj);
      toast('Conjecture proved!', `${c.name} tier ${before + 1} — ${c.rewardDesc}`);
    }
  },
  buyLemmaUp(el) { L().buyLemmaUp(S(), el.dataset.id, el.dataset.count); },
  buyAnalysisUp(el) { L().buyAnalysisUp(S(), el.dataset.id, el.dataset.count); },
  buyTheoremUp(el) { L().buyTheoremUp(S(), el.dataset.id, el.dataset.count); },
  converge() {
    if (L().buyConvergence(S())) {
      modal(`<h2>Convergence</h2>
        <p style="font-style:italic">Σ<sub>n</sub> tⁿ/n! → e<sup>t</sup></p>
        <p>Your polynomial was never just a polynomial. As the degrees stacked up, the series
        closed in on the exponential function — and now it has arrived. Growth will never be
        polynomial again.</p>
        <p class="small muted">A new factor e<sup>βt</sup> is attached to ẋ. Build β in the Analysis tab.
        Numbers will now outgrow plain notation — scientific notation unlocked, permanently.</p>`);
    }
  },
  claimTheorem() { L().claimTheorem(S()); },
  startConj(el) { L().startConjecture(S(), el.dataset.id); activeTab = 'terms'; },
  exitConj() { L().exitConjecture(S()); },
  unlockField(el) { L().unlockField(S(), el.dataset.id); },
  toggleField(el) { L().setActiveField(S(), el.dataset.id); },
  fieldUp(el) { L().buyFieldUp(S(), el.dataset.id, 'up'); },
  fieldUpMax(el) {
    for (let i = 0; i < 100 && L().buyFieldUp(S(), el.dataset.id, 'up'); i++) {}
  },
  fieldDim() { L().buyFieldUp(S(), 'geometry', 'dim'); },
  paradigm() {
    const s = S();
    const n = s.paradigms;
    if (L().doParadigm(s)) {
      const eff = P.PARADIGM_EFFECTS[n] || 'The compounding continues: ×1,000 production and a deeper seed.';
      modal(`<h2>Paradigm Shift ${n + 1}</h2>
        <p>The old framework dissolves. What was a theorem is now a footnote; what was
        unthinkable is now an exercise.</p>
        <p><b>New effect:</b> ${esc(eff)}</p>
        <p class="small muted">Production ×1,000 permanently. Next shift requires doubling this exponent.</p>`);
      activeTab = 'terms';
    }
  },
  crisis() {
    const s = S();
    const n = s.crises;
    if (L().doCrisis(s)) {
      modal(`<h2>The Crisis of Foundations${n > 0 ? ' ' + (n + 1) : ''}</h2>
        <p style="font-style:italic">"There is just one point where I have encountered a difficulty…" — Russell to Frege, 1902</p>
        <p>The tower knew its own name, and that was enough. Everything above the fields collapses
        into <b>axioms</b> — and mathematics must now be founded, not merely done.</p>
        <p class="small muted">Choose an axiom system on the Foundations tab. Consistency strength: ${esc(L().ordinalLabel(s))}.</p>`);
      activeTab = 'foundations';
    }
  },
  chooseFoundation(el) {
    const s = S();
    if (L().chooseFoundation(s, el.dataset.id)) {
      const f = P.FOUNDATIONS.find(v => v.id === el.dataset.id);
      toast('Foundation adopted', f.name + ' — ' + f.tagline);
    }
  },
  buyAxiomUp(el) { L().buyAxiomUp(S(), el.dataset.id, el.dataset.count); },
  enterUniverse(el) {
    const s = S();
    if (L().enterUniverse(s, el.dataset.id)) {
      const v = P.UNIVERSES.find(w => w.id === el.dataset.id);
      modal(`<h2>Entering ${esc(v.name)}</h2>
        <p>${esc(v.desc)}</p>
        <p class="small muted">Reach ${v.target} paradigms here to collapse it into ${v.truths} Truth${v.truths > 1 ? 's' : ''}.
        The crisis's axioms are yours either way; choose a foundation as usual.</p>`);
      activeTab = 'foundations';
    }
  },
  abandonUniverse() { L().abandonUniverse(S()); },
  closeModal() { closeModal(); },
  saveNow() { global.Game.save(); toast('Saved', 'Progress written to browser storage.'); },
  exportSave() {
    const str = SaveSystem.exportString(L().serialize(S()));
    if (navigator.clipboard) navigator.clipboard.writeText(str).then(
      () => toast('Exported', 'Save string copied to clipboard.'),
      () => promptExport(str));
    else promptExport(str);
  },
  showImport() { importAreaOpen = true; },
  doImport() {
    const txt = document.getElementById('import-text').value;
    try {
      const raw = SaveSystem.importString(txt);
      global.Game.state = L().deserialize(raw);
      global.Game.save();
      toast('Imported', 'Save loaded.');
      renderAll(true);
    } catch (e) {
      toast('Import failed', 'That save string could not be read.');
    }
  },
  wipe() {
    modal(`<h2>Hard Reset</h2><p>Erase <b>everything</b> — all paradigms, achievements, the record
      itself — and return to the successor function?</p>
      <p><button data-action="confirmWipe" style="color:var(--accent)">Yes, erase it all</button></p>`);
  },
  confirmWipe() {
    SaveSystem.wipe();
    global.Game.state = L().newGame();
    closeModal();
    renderAll(true);
  },
};

function promptExport(str) {
  modal(`<h2>Export</h2><textarea onclick="this.select()">${esc(str)}</textarea>`);
}

// ---------- wiring ----------

// Actions that fire on press and repeat while held (and are excluded from click)
const HOLD_ACTIONS = { prove: true, click: true };

function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { activeTab = tabBtn.dataset.tab; renderAll(true); return; }
  const el = e.target.closest('[data-action]');
  if (!el || HOLD_ACTIONS[el.dataset.action]) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { fn(el); renderAll(true); }
}

// While a pointer is down, the DOM must not be replaced under it — otherwise the
// click whose press/release straddles a re-render is silently lost.
let pointerHeld = false;
let holdDelay = null, holdRepeat = null;

function onPointerDown(e) {
  pointerHeld = true;
  const el = e.target.closest('[data-action]');
  if (el && HOLD_ACTIONS[el.dataset.action] && !el.disabled) {
    const action = el.dataset.action;
    ACTIONS[action](el);
    renderAll(true);
    holdDelay = setTimeout(() => {
      holdRepeat = setInterval(() => { ACTIONS[action](el); renderAll(true); }, 160);
    }, 400);
  }
}

function onPointerEnd() {
  clearTimeout(holdDelay); clearInterval(holdRepeat);
  holdDelay = holdRepeat = null;
  // release AFTER the click event has dispatched, so the render can't eat it
  setTimeout(() => { pointerHeld = false; renderAll(false); }, 60);
}

function onChange(e) {
  const el = e.target.closest('[data-setting]');
  if (!el) return;
  const s = S();
  const key = el.dataset.setting;
  if (key === 'theme') {
    if (el.value) document.documentElement.dataset.theme = el.value;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('qed-theme', el.value); } catch (err) {}
    return;
  }
  if (el.type === 'checkbox') s.settings[key] = el.checked;
  else if (el.type === 'number') s.settings[key] = Math.max(1.1, parseFloat(el.value) || 2);
  else s.settings[key] = el.value;
}

function inputFocused() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

let lastStructure = '';
const morphTemplate = typeof document !== 'undefined' ? document.createElement('div') : null;

/* Update `from` in place to match `to`, preserving element identity so buttons
 * under the cursor are never detached mid-click and hover states survive.
 * morphChildren is the top-level entry: the container keeps its own attributes. */
function morphChildren(from, to) {
  while (from.childNodes.length > to.childNodes.length) from.removeChild(from.lastChild);
  for (let i = 0; i < to.childNodes.length; i++) {
    const f = from.childNodes[i], t = to.childNodes[i];
    if (!f) { from.appendChild(t.cloneNode(true)); continue; }
    if (f.nodeType !== t.nodeType || (f.nodeType === 1 && f.tagName !== t.tagName)) {
      from.replaceChild(t.cloneNode(true), f);
    } else if (f.nodeType === 3 || f.nodeType === 8) {
      if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue;
    } else if (f.nodeType === 1) {
      morph(f, t);
    }
  }
}

function morph(from, to) {
  // sync attributes
  for (let i = from.attributes.length - 1; i >= 0; i--) {
    const n = from.attributes[i].name;
    if (!to.hasAttribute(n)) from.removeAttribute(n);
  }
  for (const a of to.attributes) {
    if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  // sync live form state (skip the element the user is interacting with)
  if (document.activeElement !== from) {
    if (from.tagName === 'INPUT') {
      if (from.type === 'checkbox') { if (from.checked !== to.checked) from.checked = to.checked; }
      else if (from.value !== to.value) from.value = to.value;
    } else if (from.tagName === 'SELECT') {
      const sel = to.querySelector('option[selected]');
      if (sel && from.value !== sel.value) from.value = sel.value;
    }
  }
  morphChildren(from, to);
}

function renderAll(force) {
  const s = S();
  renderHeader();
  renderTabbar();
  // ensure active tab is still visible
  const tabDef = TABS.find(t => t.id === activeTab);
  if (tabDef && tabDef.visible && !tabDef.visible(s)) activeTab = 'terms';
  if (!force && (inputFocused() || pointerHeld)) return;
  const html = TAB_RENDERERS[activeTab]();
  if (force || html !== lastStructure) {
    morphTemplate.innerHTML = html;
    morphChildren(document.getElementById('main'), morphTemplate);
    lastStructure = html;
  }
}

function onKeydown(e) {
  if (inputFocused() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { closeModal(); return; }
  const s = S();
  if (e.key === 'p' && L().canProve(s)) { ACTIONS.prove(); renderAll(true); }
  else if (e.key === 't' && L().canTheorem(s)) { L().claimTheorem(s); renderAll(true); }
}

function init() {
  document.body.addEventListener('click', onClick);
  document.body.addEventListener('change', onChange);
  document.body.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);
  try {
    const th = localStorage.getItem('qed-theme');
    if (th) document.documentElement.dataset.theme = th;
  } catch (err) {}
  renderAll(true);
}

global.UI = { init, renderAll, toast, modal, closeModal, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
