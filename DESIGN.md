# Q.E.D. — a mathematical idle

**Elevator pitch:** You are bootstrapping mathematics itself. Your production rate is a
literal equation shown on screen — a Taylor series you construct term by term. The
entire game arc is a climb up the growth-rate ladder: polynomial → exponential →
hyperexponential, with each prestige layer *changing the kind of function you are*,
not just its size. The number display evolves alongside (plain integers → scientific
→ ee-notation) as diegetic content.

Design synthesizes research on the genre (Exponential Idle, Antimatter Dimensions,
Revolution Idle, Synergism, Ordinal Markup, etc.) and design theory (Pecorella GDC
talks, Paper Pilot's Guide to Incrementals). Key principles applied:

- Every wall has a designated breaker (a new term, upgrade, or layer — never "wait").
- Prestige is diegetic (∎ Q.E.D. — you complete a proof) and always previewed.
- Automation is content: manual mechanic → tedium → automation as a milestone reward
  that **persists through resets** (AD eternity-milestone pattern), then a new manual
  mechanic occupies the freed attention.
- Each layer changes rules, not just numbers.
- 2–3 active goals at all times; visible locked tabs as promises.
- Challenges = rule inversions named after famous conjectures.
- Notation is a deliberate stance: it upgrades as the story of your growth.

---

## Resource & formula core

The central resource is **x** ("the Number"). Its growth rate is the on-screen formula:

```
dx/dt = M · Σₙ aₙ · tⁿ / n!
```

- `t` = time since last proof (run time), sped up by ṫ (t-speed) upgrades.
- `aₙ` = level of the degree-n term, purchased with x. Each term displays as an
  actual summand: `a₃·t³/3!`.
- `M` = product of all global multipliers (lemmas, theorems, fields, achievements).
- Unlocking all terms with growing coefficients means your polynomial *approaches eᵗ*
  — the Act I → Act II transition is literally your Taylor series converging. This is
  the game's signature moment.

Within a run, production is polynomial in t; costs are exponential in levels. The
crossover produces the classic wall/burst pacing automatically (Pecorella Part I).
Resetting zeroes t — so your highest-degree terms (worth t^n) create real tension
about when to prove.

## Layer structure

### Act I — Arithmetic (first ~2–4 hours, prestige cadence minutes→tens of minutes)
- Start: x = 0, only term a₀ ("+1"). A manual **Increment** button (obsoleted in
  minutes by a₀ levels).
- Buy term levels; unlock degrees 1, 2, 3… at steep x thresholds.
- **Proof (∎ Q.E.D.)** — prestige layer 1, unlocked at x ≥ 1e6:
  - Resets x, t, term levels/degrees.
  - Grants **Lemmas**: `gain = floor((x / 1e6)^0.45)` (current-run-x based —
    flexible reset timing, no dead runs; per research on formula families).
  - Preview always shown on the button.
- **Lemma upgrades** (spend lemmas, persist through proofs): boost M, ṫ (t-speed),
  head starts (start with degrees pre-unlocked, free levels), lemma gain exponent.
- **Proof-count milestones** (permanent, never reset): term autobuyers one degree at
  a time, auto-prove option, ×2 boosts. Restores automation so proofs never re-tread.

### Act II — Analysis (hours → ~1–2 weeks, unlock at degree 8 + convergence upgrade)
- **Convergence event**: the series "converges"; formula gains an exponential factor:
  `dx/dt = M · e^(β·t) · Σ …`. Display switches to scientific notation (celebrated
  in-game). β built from new **Analysis** purchases costing lemmas.
- **Theorem** — prestige layer 2, unlocked at x ≥ 1e50:
  - Resets proofs, lemmas, lemma upgrades (milestones & achievements persist).
  - Grants **Theorems**: `gain = floor((log10(x) / 50)^1.5)` style — log-based, so
    Act II walls are exponent walls.
  - Theorem upgrades: raise β, multiply lemma gain, keep lemma upgrades on theorem
    reset (anti-re-tread), unlock Conjectures, unlock Fields.
- **Conjectures** (challenges; named Goldbach, Collatz, Twin Prime, Legendre…):
  rule-inverted proof runs (no even-degree terms; t decays; costs inflate; x leaks).
  Rewards: permanent QoL + multipliers. Cheap content, high replay value.

### Act III — Fields of Mathematics (weeks → months)
- Unlocked via theorem upgrade. Like Exponential Idle's theories: each **Field** is a
  self-contained mini-generator with a *distinct growth shape*, producing rigor ρ_f;
  total **Rigor** multiplies everything. One field active at a time → rotation
  decisions, different idle/active profiles.
  - **Geometry**: n-dimensional hypercube; volume sⁿ; buy side growth & dimensions
    (AD-cascade homage, superexponential in dimension count).
  - **Number Theory**: prime sieve; production ∝ product of found primes; primes
    thin out logarithmically (diegetic slowdown), boosted by upgrades.
  - **Combinatorics**: factorial engine n!; n increments slowly, huge steps.
  - **Chaos**: logistic-map orbit; stochastic multiplier (different texture; the
    Replicanti lesson).
- **Paradigm** — prestige layer 3 (endgame spine, months): resets theorems and below;
  grants **Paradigms**; each paradigm raises the *hyperoperation level* of the
  formula's outer wrapper (e^t → e^e^t territory), display moves toward ee-notation.
  (v1 ships the layer with its first rule-change tier; deeper tiers are the visible
  "???" promise.)

### Act IV — Foundations (weeks)
- At 12 paradigms (+2 per crisis) the **Crisis of Foundations** converts paradigms to
  **Axioms** and resets the paradigm layer. Each crisis you choose one of four
  **axiom systems** (ZFC / Constructivism / Platonism / Formalism) whose rule changes
  last until the next crisis — distinct optimal playstyles per foundation.
- Crisis count climbs an **ordinal ladder** (ω, ω·2, ω², ω^ω, ε₀ …); milestones grant
  the automation this depth demands (auto-paradigm; paradigm-proof and crisis-proof
  upgrade retention). Axiom upgrades are permanent.

### Act V — Universes (weeks–months)
- From crisis 3, a crisis can be taken *sideways* into a modified universe (V = L,
  Forcing, Large Cardinals, Determinacy, and the all-at-once finale Ultimate L).
- Targets are **relative to the frontier** (crisisReq + per-universe offset, with
  log-ratio conversion for ×3-ladder universes) so difficulty tracks player power.
- Completion banks permanent **Truths**; all five tease Act VI (The Absolute).

### Persistent meta
- **Achievements** (named after mathematicians), each +2% M — completionism feeds power.
- **Notation setting** unlocks as the game reaches each era (plain → scientific →
  letters → log view).
- Offline progress: full-rate simulation in chunks, "While you were away" summary
  screen. No offline penalty (research: exponential costs already bound offline gains).

## Balance model
All curves live in `sim/params.js` (single source of truth, imported by both game and
simulator). `sim/sim.js` plays a greedy strategy headlessly to chart pacing; used to
tune walls before shipping. Targets:
- First proof ≤ 40 min; proofs 5–15 min mid-Act-I; first theorem ~day 1–2;
  first paradigm ~week 3+; always ≥2 visible goals.

## Tech
- Vanilla JS, no build step, works from file:// (plain script tags, no modules).
- Custom break_infinity-style Dec library (mantissa + float64 exponent, to ~e9e15).
- localStorage save (versioned, base64 export/import), 10 s autosave.
- Tick: 10 Hz simulation, ~4 Hz UI render. Offline catch-up in ≤1000 chunks.
- Layout: single-page, tab bar, formula banner always visible. Mobile-friendly CSS
  (for the eventual iOS wrap via WKWebView/Capacitor).
