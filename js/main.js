/* Game bootstrap: loop, save/load, offline progress. */
'use strict';

(function (global) {

const Game = {
  state: null,

  save() {
    return SaveSystem.save(Logic.serialize(this.state));
  },

  load() {
    const raw = SaveSystem.load();
    if (raw) {
      try {
        this.state = Logic.deserialize(raw);
        return true;
      } catch (e) {
        console.error('deserialize failed, starting fresh', e);
      }
    }
    this.state = Logic.newGame();
    return false;
  },
};

// Simulate a long span in chunks (offline progress / background-tab catch-up)
function simulateSpan(s, seconds) {
  const chunks = Math.min(P.OFFLINE_MAX_CHUNKS, Math.max(1, Math.ceil(seconds)));
  const dt = seconds / chunks;
  for (let i = 0; i < chunks; i++) Logic.tick(s, dt);
}

function offlineCatchup(savedAt) {
  const s = Game.state;
  let elapsed = (Date.now() - savedAt) / 1000;
  if (elapsed < 60) return;
  elapsed = Math.min(elapsed, P.OFFLINE_CAP_HOURS * 3600);

  const before = {
    x: s.x.clone(), log: s.x.isZero() ? 0 : s.x.log10(),
    proofs: s.totalProofs, lemmas: s.lemmas.clone(), theorems: s.theorems.clone(),
  };
  simulateSpan(s, elapsed);
  const gainedProofs = s.totalProofs - before.proofs;
  const lines = [
    `<p>You were away for <b>${formatTime(elapsed)}</b>. The mathematics continued.</p>`,
    `<p>x: ${UI.fmt(before.x)} → <b>${UI.fmt(s.x)}</b></p>`,
  ];
  if (gainedProofs > 0) lines.push(`<p>Auto-proofs completed: <b>${gainedProofs}</b>
    (lemmas ${UI.fmt(before.lemmas)} → ${UI.fmt(s.lemmas)})</p>`);
  if (!s.theorems.eq(before.theorems)) lines.push(`<p>Theorems: ${UI.fmt(before.theorems)} → <b>${UI.fmt(s.theorems)}</b></p>`);
  if (s.activeFields.length > 0) lines.push(`<p class="small muted">Your active field${s.activeFields.length > 1 ? 's' : ''} kept accruing rigor.</p>`);
  UI.modal(`<h2>While You Were Away</h2>${lines.join('')}`);
}

function checkAchievementsAndToast() {
  const s = Game.state;
  const newly = Logic.checkAchievements(s);
  for (const id of newly) {
    const a = P.ACHIEVEMENTS.find(v => v.id === id);
    if (a) UI.toast(`☑ ${a.name}`, a.desc + ` (production ×${P.ACHIEVEMENT_MULT})`);
  }
  while (s.events && s.events.length) {
    const ev = s.events.shift();
    if (ev.type === 'universe') {
      const v = P.UNIVERSES.find(w => w.id === ev.id);
      UI.modal(`<h2>${v.name} collapses</h2>
        <p>The universe folds into what was true in it all along: <b>${ev.truths} Truth${ev.truths > 1 ? 's' : ''}</b>
        (production ×1e${P.TRUTH_PROD_EXP} each, permanent).</p>`);
    }
  }
}

function start() {
  const raw = SaveSystem.load();
  let savedAt = null;
  if (raw && raw.__savedAt) savedAt = raw.__savedAt;
  Game.load();
  UI.init();

  // stamp save time inside the payload on every save
  const origSerialize = Logic.serialize;
  Logic.serialize = function (s) {
    const out = origSerialize(s);
    out.__savedAt = Date.now();
    return out;
  };

  if (savedAt) offlineCatchup(savedAt);

  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt <= 0) return;
    if (dt > 5) {
      // background-tab throttling produced a gap; simulate it honestly
      simulateSpan(Game.state, dt);
    } else {
      Logic.tick(Game.state, dt);
    }
  }, P.TICK_MS);

  setInterval(() => UI.renderAll(false), P.RENDER_MS);
  setInterval(() => Game.save(), P.AUTOSAVE_MS);
  setInterval(checkAchievementsAndToast, 1000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.addEventListener('beforeunload', () => Game.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Game.save();
  });
}

global.Game = Game;
document.addEventListener('DOMContentLoaded', start);
})(typeof window !== 'undefined' ? window : globalThis);
