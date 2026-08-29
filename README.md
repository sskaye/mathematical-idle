# Q.E.D. — a mathematical idle

You are bootstrapping mathematics itself. Your production rate is a **literal Taylor
series shown on screen**, built term by term — and the entire game arc is a climb up
the growth-rate ladder: polynomial → exponential → superexponential, with the number
notation evolving alongside as the story of your growth.

## Play

Open `index.html` in any modern browser — it runs from the filesystem, no build step
or server needed. (Or serve the folder with `python3 -m http.server` if you prefer.)

Saves live in the browser's localStorage (autosave every 10 s), with export/import
strings in Settings. Closing the game is fine: offline progress is simulated at full
rate for up to 14 days, with a welcome-back summary.

## The arc (spoiler-light)

| System | What it is | Typical arrival |
|---|---|---|
| The Series | Buy Taylor-term levels; unlock degrees; t resets on proof | minute 1 |
| Proofs (∎ Q.E.D.) | First prestige: reset for Lemmas; milestone automation | ~3 min |
| Convergence | Unlock 8 degrees and the series converges to e^(βt) | ~2 h |
| Theorems | Second prestige, earned from the *exponent* of x | ~2 h |
| Conjectures | 7 challenge runs by "elementary methods" (β disabled), 3 tiers each | ~3 h |
| Fields | 6 idle engines with distinct growth shapes; rigor multiplies β | ~5 h onward |
| Paradigms | Third prestige (2000·2ⁿ exponent ladder); 8 rule-changing effects | ~10 h, decelerating into weeks |
| Notebook | Narrative marginalia unlocking as the work does | first proof |

The Fields include the classification of the finite simple groups (ending, weeks in,
at the Monster) and a Gödel-encoding Logic field that scales off everything else.
Late Paradigms automate conjectures, deepen the exponential (e^(βt^1.1)), and allow
three simultaneous fields. 29 achievements named for mathematicians each add ×1.02.
Hotkeys: `p` proves, `t` claims a theorem.

Pacing was tuned with a headless greedy-player simulation (`node sim/sim.js 45`
plays 45 days in under a second) to guarantee no runaway explosions and no dead
zones — every wall has a designated breaker.

## Code layout

```
index.html        shell (plain script tags, file:// safe)
css/style.css     math-paper theme, light + dark
js/decimal.js     big-number core (mantissa + float64 exponent, to ~1e9e15)
js/format.js      adaptive notation (plain → scientific → ee)
js/params.js      ALL balance numbers & content definitions (single source of truth)
js/logic.js       pure game logic, no DOM (shared with the simulator)
js/save.js        versioned localStorage saves + export strings
js/ui.js          tabbed UI, event delegation, 4 Hz renders
js/main.js        loop, offline catch-up, autosave
sim/sim.js        pacing simulator (greedy bot over the real logic)
test/             big-number & format unit tests (node test/decimal.test.js)
DESIGN.md         full design rationale & research-derived principles
```

Because `logic.js` is DOM-free and `params.js` centralizes every curve, rebalancing
is a one-file edit followed by a sim run — and an iOS port only needs a WebView wrapper
(Capacitor/WKWebView) around this folder, or a Swift UI on top of the same logic.
