/* Number formatting: plain -> scientific -> stacked exponent display. */
'use strict';

(function (global) {

function commify(n, decimals) {
  const s = n.toFixed(decimals);
  const [int, frac] = s.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? withCommas + '.' + frac : withCommas;
}

/**
 * format(x, decimals=2)
 *  < 1e6      : 123,456 or 12.34
 *  < 1e100000 : 1.23e456 (mantissa dropped past e1e6 auto via exponent size)
 *  huge       : e1.23e456 (log-log display)
 */
function format(x, decimals = 2) {
  const d = Dec.from(x);
  if (Number.isNaN(d.m)) return 'NaN';
  if (d.m < 0) return '-' + format(d.neg(), decimals);
  if (d.isZero()) return '0';

  const log = d.log10();
  if (log < -3) return d.toNumber().toExponential(decimals).replace('e-', 'e-');
  if (log < 6) {
    const n = d.toNumber();
    if (Number.isInteger(n) && n < 1e6) return commify(n, 0);
    if (n < 1000) return n.toFixed(decimals);
    return commify(n, 0);
  }
  if (d.e < 1e6) {
    return d.m.toFixed(decimals) + 'e' + commify(d.e, 0);
  }
  // log-log territory: show e(exponent in scientific)
  const eDec = Dec.fromNumber(d.e);
  return 'e' + eDec.m.toFixed(decimals) + 'e' + commify(eDec.e, 0);
}

/** Integer-ish formatting for whole quantities (levels, counts). */
function formatInt(x) {
  const d = Dec.from(x);
  if (d.log10() < 9) return commify(Math.round(d.toNumber()), 0);
  return format(d, 2);
}

/** Format a multiplier like x1.50 / x2,300 / x1.2e30 */
function formatMult(x, decimals = 2) {
  return '×' + format(x, decimals);
}

/** Seconds -> "3d 4h 05m" style */
function formatTime(sec) {
  if (!isFinite(sec)) return '—';
  if (sec < 0) sec = 0;
  if (sec < 1) return sec.toFixed(2) + 's';
  if (sec < 60) return sec.toFixed(1) + 's';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  if (m < 60) return m + 'm ' + String(s).padStart(2, '0') + 's';
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + 'h ' + String(mm).padStart(2, '0') + 'm';
  const dd = Math.floor(h / 24), hh = h % 24;
  if (dd < 365) return dd + 'd ' + hh + 'h';
  return (dd / 365).toFixed(1) + 'y';
}

global.format = format;
global.formatInt = formatInt;
global.formatMult = formatMult;
global.formatTime = formatTime;
})(typeof window !== 'undefined' ? window : globalThis);
