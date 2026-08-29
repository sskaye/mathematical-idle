/* All balance parameters and content definitions. Single source of truth shared by
 * the game and the pacing simulator (sim/sim.js). */
'use strict';

(function (global) {

const P = {};

// ---------------- Act I: Taylor terms ----------------
P.MAX_DEGREE = 10;

// Cost of level k (0-indexed) of degree-n term: TERM_BASE[n] * TERM_R[n]^k
P.TERM_BASE = [1, 25, 4e3, 1e6, 5e8, 1e12, 5e15, 1e20, 1e25, 1e31, 1e38];
P.TERM_R    = [1.18, 1.22, 1.26, 1.30, 1.34, 1.38, 1.42, 1.46, 1.50, 1.55, 1.60];
// Milestone: every 25 levels of a term doubles its contribution
P.TERM_MILESTONE = 25;

// x cost to unlock degree n (one-time per run, until head-start upgrades)
P.DEGREE_UNLOCK = [0, 100, 2e4, 5e6, 5e9, 5e13, 5e17, 5e22, 5e28, 5e35, 5e43];

// Manual increment button: adds max(1, 1% of dx/dt) per click
P.CLICK_FRACTION = 0.01;

// ---------------- Layer 1: Proofs & Lemmas ----------------
P.PROOF_REQ = 1e6;          // min x to prove
P.LEMMA_POW = 0.45;         // lemmas = floor((x/PROOF_REQ)^LEMMA_POW * lemmaGainMult)
P.LEMMA_EFFECT_POW = 0.5;   // M *= (1+lemmas)^LEMMA_EFFECT_POW (loop gain must stay << 1)

// Lemma upgrades: cost(level) in lemmas, geometric
P.LEMMA_UPGRADES = [
  { id: 'notation',  name: 'Clearer Notation', desc: '×2 production per level',
    base: 3, r: 4, max: 999 },
  { id: 'tempo',     name: 'Tempo', desc: '+25% t-speed per level',
    base: 5, r: 5, max: 20 },   // capped: t-speed feeds e^(βt), must stay bounded
  { id: 'headstart', name: 'Familiar Ground', desc: 'Start proofs with one more degree unlocked per level',
    base: 10, r: 12, max: 10 },
  { id: 'coeffs',    name: 'Standing Assumptions', desc: 'Start each unlocked term at +5 levels per level',
    base: 25, r: 8, max: 40 },
  { id: 'induction', name: 'Induction', desc: '+0.03 lemma-gain exponent per level',
    base: 100, r: 25, max: 8 },
];

// Proof-count milestones (permanent through all resets)
P.PROOF_MILESTONES = [
  { at: 1,   id: 'buymax',   desc: 'Unlock Buy Max buttons' },
  { at: 3,   id: 'auto0',    desc: 'Autobuy the constant term a₀' },
  { at: 6,   id: 'auto1',    desc: 'Autobuy a₁' },
  { at: 10,  id: 'auto2',    desc: 'Autobuy a₂' },
  { at: 15,  id: 'auto3',    desc: 'Autobuy a₃' },
  { at: 22,  id: 'auto4',    desc: 'Autobuy a₄' },
  { at: 30,  id: 'auto5',    desc: 'Autobuy a₅' },
  { at: 45,  id: 'autoDeg',  desc: 'Auto-unlock degrees' },
  { at: 65,  id: 'auto6',    desc: 'Autobuy a₆ and above' },
  { at: 100, id: 'autoProve',desc: 'Unlock Auto-Prove (configurable)' },
];

// ---------------- Act II: Convergence & Analysis ----------------
P.CONVERGENCE_DEGREE = 8;      // degrees unlocked required
P.CONVERGENCE_COST = 2500;     // lemmas (one-time)
// dx/dt *= e^(beta*t). log10(x) grows at ~beta·tspeed/ln(10) OoM per second, so
// beta directly sets the pace of Act II+ — it must start tiny and take weeks to max.
P.BETA_BASE = 0.001;

// Analysis upgrades (cost lemmas).
// IMPORTANT: these multiply the EXPONENT of x, so their totals must be bounded —
// unbounded levels here create a >1-gain feedback loop (x → lemmas → β → x).
P.ANALYSIS_UPGRADES = [
  { id: 'beta',    name: 'Growth Constant β', desc: '+0.001 β per level',
    base: 1e3, r: 4.0, max: 30 },
  { id: 'betaMul', name: 'Rate Refinement', desc: '×1.15 β per level',
    base: 1e5, r: 30, max: 8 },
  { id: 'tphase',  name: 'Phase Shift', desc: 'e^(βt) acts as if t were 10% larger, per level',
    base: 1e4, r: 30, max: 8 },
];

// ---------------- Layer 2: Theorems ----------------
P.THEOREM_REQ_LOG10 = 50;      // min log10(x) to claim a theorem
P.THEOREM_POW = 1.2;           // theorems = floor((log10(x)/50)^1.2 * mult)
P.THEOREM_EFFECT = 0.25;       // M *= (1+theorems)^... no: each theorem ×(1+.25)? see logic

P.THEOREM_UPGRADES = [
  { id: 'rigor',     name: 'Rigor', desc: '×3 production per level',
    base: 1, r: 3, max: 200 },
  { id: 'lemmaBoost',name: 'Lemma Corollaries', desc: '×5 lemma gain per level',
    base: 2, r: 5, max: 200 },
  { id: 'keepLemmaUps', name: 'Collected Works', desc: 'Keep Lemma & Analysis upgrades on Theorem reset',
    base: 3, r: 1, max: 1 },
  { id: 'betaBoost', name: 'Asymptotics', desc: '×1.3 β per level',
    base: 5, r: 20, max: 6 },
  { id: 'autoAnalysis', name: 'Research Assistants', desc: 'Autobuy Analysis upgrades',
    base: 20, r: 1, max: 1 },
  { id: 'conjectures', name: 'Open Problems', desc: 'Unlock Conjectures (challenge runs)',
    base: 10, r: 1, max: 1 },
  { id: 'fields',    name: 'Fields of Mathematics', desc: 'Unlock Fields',
    base: 100, r: 1, max: 1 },
];

// ---------------- Conjectures (challenges) ----------------
// Rule-inverted proof runs, by "elementary methods": e^(βt) is disabled during a
// conjecture, so only the polynomial and your multipliers work. Goal: reach the
// target under the restriction. Targets scale with best-ever x so they stay real
// challenges (effective target = max(listed, 10^(FACTOR·bestLog10x))).
// Reward: permanent bonus. Scales with completions (max 3 each).
P.CONJ_TARGET_FACTOR = [0.55, 0.63, 0.71];
// From Paradigm 4 on, each completion counts double toward its reward.
P.CONJECTURES = [
  { id: 'goldbach', name: 'Goldbach', max: 3,
    desc: 'Only even-degree terms function.',
    target: [1e30, 1e60, 1e120],
    rewardDesc: '×2 production per completion (permanent)' },
  { id: 'collatz', name: 'Collatz', max: 3,
    desc: 'Every 30s, x is halved (hailstone drag).',
    target: [1e25, 1e50, 1e100],
    rewardDesc: '+25% t-speed per completion (permanent)' },
  { id: 'twinprime', name: 'Twin Primes', max: 3,
    desc: 'Term costs scale twice as fast.',
    target: [1e20, 1e45, 1e90],
    rewardDesc: '×3 lemma gain per completion (permanent)' },
  { id: 'legendre', name: 'Legendre', max: 3,
    desc: 't-speed is quartered.',
    target: [1e25, 1e55, 1e110],
    rewardDesc: '+0.02 lemma exponent per completion (permanent)' },
  { id: 'riemannhyp', name: 'Riemann Hypothesis', max: 3,
    desc: 'Your production multiplier M is square-rooted.',
    target: [1e40, 1e80, 1e160],
    rewardDesc: '×1.25 β per completion (permanent)' },
  { id: 'pvsnp', name: 'P vs NP', max: 3,
    desc: 'Only your highest-degree term functions.',
    target: [1e35, 1e70, 1e140],
    rewardDesc: 'Term ×2 milestones come 1 level sooner per completion (permanent)' },
  { id: 'continuum', name: 'Continuum Hypothesis', max: 3,
    desc: 't is frozen at 60 — the polynomial cannot grow.',
    target: [1e30, 1e65, 1e130],
    rewardDesc: '+1 starting degree and +25 starting term levels per completion (permanent)' },
];

// ---------------- Act III: Fields ----------------
// Each field accrues rigor ρ while active. Total rigor multiplies production.
P.FIELDS = [
  { id: 'geometry', name: 'Geometry', unlockCost: 0,
    desc: 'An n-cube grows its side s over time; ρ gains ∝ its volume sⁿ. Buy dimensions to raise n.' },
  { id: 'numtheory', name: 'Number Theory', unlockCost: 100,
    desc: 'A sieve finds primes over time; ρ gains ∝ the product of found primes. Primes thin out as they grow.' },
  { id: 'combinatorics', name: 'Combinatorics', unlockCost: 5000,
    desc: 'A factorial engine: ρ gains ∝ n!. Raising n takes exponentially longer each time.' },
  { id: 'chaos', name: 'Chaos', unlockCost: 100000,
    desc: 'A logistic-map orbit x→rx(1−x); ρ gains spike unpredictably with the orbit. High variance, high mean.' },
  { id: 'algebra', name: 'Algebra', unlockCost: 20000,
    desc: 'The classification of finite simple groups, one group at a time; ρ gains ∝ the order of the largest group classified. It ends at the Monster. Probably.' },
  { id: 'logic', name: 'Logic', unlockCost: 2000000,
    desc: 'Gödel-encodes your other fields: ρ gains scale with everything the rest of mathematics has built. The last field, and the one that watches the others.' },
];
// log10(rigor multiplier) = Σ_f WEIGHT_f · log10(ρ_f)^DAMP — sublinear damping so
// month-scale accumulation lands in the hundreds-to-low-thousands of OoM.
P.FIELD_WEIGHT = { geometry: 1.0, numtheory: 0.3, combinatorics: 1.1, chaos: 1.5,
                   algebra: 0.9, logic: 0.8 };
P.RIGOR_DAMP = 0.85;
P.CHAOS_SCALE_CAP = 250;

// Geometry: side grows +GEO_SIDE_RATE/s (upgradeable ×1.5), volume = s^dims
P.GEO = { sideRate: 0.05, sideUpBase: 10, sideUpR: 4, dimBase: 100, dimR: 25, maxDims: 12 };
// Number theory: next prime found after (p_next/10)^0.8 seconds (upgradeable speed)
P.NT = { speedUpBase: 10, speedUpR: 5 };
// Combinatorics: n increments every 60 * 1.5^n seconds (upgradeable)
P.COMBO = { speedUpBase: 10, speedUpR: 5, baseInterval: 60, intervalR: 1.5 };
// Chaos: r parameter upgrades push toward chaotic regime, mean gain rises
P.CHAOS = { rBase: 3.2, rStep: 0.05, rUpBase: 10, rUpR: 4, maxRLevel: 15 };
// Algebra: classify group idx after baseInterval·intervalR^idx seconds (upgradeable 2×)
P.ALG = { speedUpBase: 15, speedUpR: 5, baseInterval: 90, intervalR: 1.25 };
// [name, log10(order), sporadic?] — ascending order; after the list, "exotic
// structures" continue at +3 log-order each.
P.GROUPS = [
  ['C₂', 0.301], ['S₃', 0.778], ['Q₈', 0.903], ['A₄', 1.079], ['S₄', 1.380],
  ['A₅', 1.778], ['PSL(2,7)', 2.225], ['A₆', 2.556], ['PSL(2,8)', 2.702],
  ['PSL(2,11)', 2.819], ['M₁₁', 3.899, true], ['M₁₂', 4.978, true],
  ['J₁', 5.244, true], ['M₂₂', 5.647, true], ['J₂', 5.781, true],
  ['M₂₃', 7.007, true], ['HS', 7.647, true], ['J₃', 7.702, true],
  ['M₂₄', 8.389, true], ['McL', 8.951, true], ['He', 9.605, true],
  ['Ru', 11.16, true], ['Suz', 11.65, true], ["O'N", 11.66, true],
  ['Co₃', 11.69, true], ['Co₂', 13.62, true], ['Fi₂₂', 13.81, true],
  ['HN', 14.44, true], ['Ly', 16.71, true], ['Th', 16.96, true],
  ['Fi₂₃', 18.61, true], ['Co₁', 18.62, true], ['J₄', 19.94, true],
  ["Fi₂₄'", 21.09, true], ['B (Baby Monster)', 33.62, true],
  ['M (the Monster)', 53.91, true],
];
// Logic: ρ gain/s = 10^(frac · Σ other fields' log10(ρ)); frac upgradeable
P.LOGIC = { fracBase: 0.35, fracStep: 0.01, upBase: 25, upR: 6, maxLevel: 15 };

// ---------------- Layer 3: Paradigms ----------------
P.PARADIGM_REQ_LOG10 = 2000;   // first shift; later ones need 2× the exponent you last shifted at
P.PARADIGM_REQ_RATIO = 2;
P.PARADIGM_EFFECTS = [
  'e^(βt) becomes e^(βt·log₁₀(1+t)) — mildly superexponential growth.',
  'Lemma and Theorem gain exponents +0.10.',
  'All Fields accrue rigor 5× faster and two may be active at once.',
  'Every Conjecture completion counts double toward its reward.',
  'Conjectures no longer reset your run, and complete themselves when their target is met.',
  'The exponential deepens: t is raised to the power 1.1 inside e^(βt).',
  'Theorem gain exponent +0.30.',
  'Three Fields active at once, and Fields accrue rigor 25× faster.',
];

// ---------------- Achievements ----------------
P.ACHIEVEMENT_MULT = 1.02;  // per achievement, multiplicative
P.ACHIEVEMENTS = [
  { id: 'peano',    name: 'Peano',      desc: 'Increment by hand 10 times.' },
  { id: 'gauss',    name: 'Gauss',      desc: 'Reach x = 5,050.' },
  { id: 'euler',    name: 'Euler',      desc: 'Unlock the t² term.' },
  { id: 'noether',  name: 'Noether',    desc: 'Complete your first Proof.' },
  { id: 'erdos',    name: 'Erdős',      desc: 'Complete 10 Proofs.' },
  { id: 'ramanujan',name: 'Ramanujan',  desc: 'Reach 1,729 total lemmas earned.' },
  { id: 'taylor',   name: 'Taylor',     desc: 'Unlock 6 degrees in one proof.' },
  { id: 'cauchy',   name: 'Cauchy',     desc: 'Converge the series.' },
  { id: 'hilbert',  name: 'Hilbert',    desc: 'Claim your first Theorem.' },
  { id: 'godel',    name: 'Gödel',      desc: 'Complete a Conjecture.' },
  { id: 'galois',   name: 'Galois',     desc: 'Unlock your first Field.' },
  { id: 'riemann',  name: 'Riemann',    desc: 'Find a prime above 1,000 in the sieve.' },
  { id: 'cantor',   name: 'Cantor',     desc: 'Reach x = 1e308 — beyond the countable double.' },
  { id: 'kuhn',     name: 'Kuhn',       desc: 'Shift your first Paradigm.' },
  { id: 'lorenz',   name: 'Lorenz',     desc: 'See a chaos orbit value above 0.99.' },
  { id: 'wiles',    name: 'Wiles',      desc: 'Complete all tiers of a Conjecture.' },
  { id: 'hardy',    name: 'Hardy',      desc: 'Reach x = 1e100. Of no practical use whatsoever.' },
  { id: 'fibonacci',name: 'Fibonacci',  desc: 'Let t reach 6,765 in a single run.' },
  { id: 'fermat',   name: 'Fermat',     desc: 'Abandon a conjecture attempt. The margin was too small.' },
  { id: 'euclid',   name: 'Euclid',     desc: 'Grow Geometry to 5 dimensions.' },
  { id: 'germain',  name: 'Germain',    desc: 'Find a Sophie Germain pair (p and 2p+1, both above 100) in the sieve.' },
  { id: 'conway',   name: 'Conway',     desc: 'Classify a sporadic group.' },
  { id: 'griess',   name: 'Griess',     desc: 'Classify the Monster.' },
  { id: 'turing',   name: 'Turing',     desc: 'Found the field of Logic.' },
  { id: 'archimedes',name:'Archimedes', desc: 'Reach 1,000 total rigor — give me a lever long enough.' },
  { id: 'banach',   name: 'Banach',     desc: 'Have two Fields active at once.' },
  { id: 'hypatia',  name: 'Hypatia',    desc: 'Shift your second Paradigm.' },
  { id: 'poincare', name: 'Poincaré',   desc: 'Shift your fourth Paradigm.' },
  { id: 'grothendieck', name: 'Grothendieck', desc: 'Shift your sixth Paradigm.' },
];

// ---------------- Notebook (narrative drip) ----------------
// Entries unlock when their condition holds; derived from state, no migration needed.
P.NOTEBOOK = [
  { id: 'n01', when: s => s.clicks >= 1, title: 'Day one',
    text: 'Begin with nothing. The empty set. Then the thing that contains it, and the thing that contains that. Counting is just insisting.' },
  { id: 'n02', when: s => s.totalProofs >= 1, title: 'First proof',
    text: 'Wrote it up. Everything on the desk swept away — the tallies, the scratchwork, even t itself. But the lemma stays. It turns out that what you keep is never the number. It\'s the argument.' },
  { id: 'n03', when: s => (s.stats.maxDegrees || 1) >= 4, title: 'Higher degrees',
    text: 'The cubic term is worthless for the first minute and then it is everything. All the interesting objects are like this: embarrassing at small t.' },
  { id: 'n04', when: s => s.totalProofs >= 25, title: 'Routine',
    text: 'The proofs are getting shorter. Not because the results are smaller — because the machinery is better. This must be what a career feels like, from inside.' },
  { id: 'n05', when: s => s.converged, title: 'Convergence',
    text: 'It was e^t the whole time. I was building e^t the whole time, term by term, and calling it a polynomial. I feel like I should apologize to it.' },
  { id: 'n06', when: s => s.totalTheorems.gte(1), title: 'A theorem',
    text: 'A theorem is a proof that other proofs can stand on. The lemmas burned like kindling — that was their job.' },
  { id: 'n07', when: s => Object.values(s.conjDone).some(v => v >= 1), title: 'Elementary methods',
    text: 'Proved it without the exponential. Slower, uglier, honest. Erdős would say the Book proof is the one with nothing borrowed.' },
  { id: 'n08', when: s => Object.keys(s.fieldsUnlocked).length >= 1, title: 'A field of one\'s own',
    text: 'Founded a field today. Strange verb, "founded" — as if it weren\'t already there, waiting, the way the diagonal waits in the square.' },
  { id: 'n09', when: s => s.fieldState.numtheory.primeIdx >= 25, title: 'The sieve',
    text: 'The primes keep thinning and keep coming. The gaps grow like ln p and my patience shrinks faster. We are both asymptotic.' },
  { id: 'n10', when: s => s.paradigms >= 1, title: 'Paradigm',
    text: 'Everything I proved is still true. That\'s the strange part. It\'s just that true means something bigger now.' },
  { id: 'n11', when: s => (s.fieldState.algebra && s.fieldState.algebra.idx >= 11), title: 'Sporadic',
    text: 'The classification has left the families behind. These new groups belong to no infinite sequence — they simply exist, twenty-six exceptions the universe insisted on.' },
  { id: 'n12', when: s => s.paradigms >= 3, title: 'Two fields',
    text: 'Ran Geometry and the sieve side by side today. They don\'t talk to each other. They don\'t need to. β hears both.' },
  { id: 'n13', when: s => s.stats.bestLog10x >= 10000, title: 'e10,000',
    text: 'The number no longer fits in the world. It fits in the exponent, which fits in the world. Notation is the art of folding.' },
  { id: 'n14', when: s => (s.fieldState.logic && s.fieldState.logic.rho && Dec.from(s.fieldState.logic.rho).gt(0)), title: 'Logic',
    text: 'Logic encodes the other fields and, presumably, itself encoding them. I have decided not to think about this after 10pm.' },
  { id: 'n15', when: s => s.paradigms >= 5, title: 'Automation',
    text: 'The conjectures prove themselves now, when the numbers arrive. I miss them slightly. This is also what a career feels like, from inside.' },
  { id: 'n16', when: s => (s.fieldState.algebra && s.fieldState.algebra.idx >= P.GROUPS.length), title: 'The Monster',
    text: '8×10⁵³ symmetries and it took the whole field to see it. The classification is done. (There are exotic structures past it. There are always exotic structures past it.)' },
  { id: 'n17', when: s => s.paradigms >= 7, title: 'Deep water',
    text: 'Each paradigm demands double the exponent of the last. The demand is honest: understanding compounds, but so does the size of what remains.' },
  { id: 'n18', when: s => Object.keys(s.achievements).length >= P.ACHIEVEMENTS.length, title: 'The margin',
    text: 'Every name on the wall is accounted for. Somewhere past the last page of this notebook there is another notebook. Q.E.D., for now.' },
];

// ---------------- Engine ----------------
P.TICK_MS = 100;            // simulation tick
P.RENDER_MS = 250;          // UI render
P.AUTOSAVE_MS = 10000;
P.OFFLINE_MAX_CHUNKS = 1000;
P.OFFLINE_CAP_HOURS = 24 * 14;  // cap offline credit at 2 weeks

global.P = P;
})(typeof window !== 'undefined' ? window : globalThis);
