/* Save/load: localStorage with versioned migrations + import/export strings. */
'use strict';

(function (global) {

const SAVE_KEY = 'mathematical-idle-save';
const SAVE_VERSION = 1;

function encodeSave(obj) {
  const json = JSON.stringify({ v: SAVE_VERSION, t: Date.now(), d: obj });
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSave(str) {
  const json = decodeURIComponent(escape(atob(str.trim())));
  const parsed = JSON.parse(json);
  if (typeof parsed.v !== 'number' || !parsed.d) throw new Error('bad save');
  return migrate(parsed);
}

function migrate(parsed) {
  // Future migrations: if (parsed.v === 1) { ...; parsed.v = 2; }
  return parsed.d;
}

const SaveSystem = {
  save(obj) {
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(obj));
      return true;
    } catch (e) {
      console.error('save failed', e);
      return false;
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return decodeSave(raw);
    } catch (e) {
      console.error('load failed', e);
      return null;
    }
  },
  exportString(obj) { return encodeSave(obj); },
  importString(str) { return decodeSave(str); },  // throws on invalid
  wipe() { localStorage.removeItem(SAVE_KEY); },
};

global.SaveSystem = SaveSystem;
})(typeof window !== 'undefined' ? window : globalThis);
