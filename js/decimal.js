/* Big-number library: value = m * 10^e, with 1 <= |m| < 10 (or m = 0).
 * e is a float64, so representable magnitudes reach ~1e(1.8e308) — far beyond
 * anything the game needs. Modeled on break_infinity.js semantics. */
'use strict';

(function (global) {

const EXP_LIMIT = 9e15;          // beyond this, treat exponent arithmetic as saturated
const NUMBER_EXP_MAX = 308;
const NUMBER_EXP_MIN = -324;

class Dec {
  constructor(m = 0, e = 0) {
    this.m = m;
    this.e = e;
  }

  static fromNumber(n) {
    if (n === 0 || !isFinite(n)) {
      if (Number.isNaN(n)) return new Dec(NaN, NaN);
      if (n === Infinity) return new Dec(1, EXP_LIMIT);
      if (n === -Infinity) return new Dec(-1, EXP_LIMIT);
      return new Dec(0, 0);
    }
    const e = Math.floor(Math.log10(Math.abs(n)));
    let m = n / Math.pow(10, e);
    // Guard rounding drift at the boundary
    if (Math.abs(m) >= 10) { m /= 10; return new Dec(m, e + 1); }
    if (Math.abs(m) < 1) { m *= 10; return new Dec(m, e - 1); }
    return new Dec(m, e);
  }

  static fromME(m, e) {
    return new Dec(m, e).normalize();
  }

  static fromString(s) {
    const i = s.indexOf('e');
    if (i === -1) return Dec.fromNumber(parseFloat(s));
    // Formats like "1.5e400" or "e400"
    const mPart = s.slice(0, i);
    const m = (mPart === '' || mPart === '-') ? (mPart === '-' ? -1 : 1) : parseFloat(mPart);
    const e = parseFloat(s.slice(i + 1));
    return new Dec(m, e).normalize();
  }

  static from(v) {
    if (v instanceof Dec) return v;
    if (typeof v === 'number') return Dec.fromNumber(v);
    if (typeof v === 'string') return Dec.fromString(v);
    if (v && typeof v.m === 'number' && typeof v.e === 'number') return new Dec(v.m, v.e).normalize();
    return new Dec(0, 0);
  }

  normalize() {
    if (this.m === 0) { this.e = 0; return this; }
    if (!isFinite(this.m) || !isFinite(this.e)) return this;
    const d = Math.floor(Math.log10(Math.abs(this.m)));
    if (d !== 0) {
      this.m /= Math.pow(10, d);
      this.e += d;
      if (Math.abs(this.m) >= 10) { this.m /= 10; this.e += 1; }
      else if (Math.abs(this.m) < 1) { this.m *= 10; this.e -= 1; }
    }
    return this;
  }

  clone() { return new Dec(this.m, this.e); }

  toNumber() {
    if (this.e > NUMBER_EXP_MAX) return this.m > 0 ? Infinity : -Infinity;
    if (this.e < NUMBER_EXP_MIN) return 0;
    return this.m * Math.pow(10, this.e);
  }

  isZero() { return this.m === 0; }
  sign() { return Math.sign(this.m); }

  neg() { return new Dec(-this.m, this.e); }
  abs() { return new Dec(Math.abs(this.m), this.e); }

  add(other) {
    const o = Dec.from(other);
    if (this.m === 0) return o.clone();
    if (o.m === 0) return this.clone();
    let big = this, small = o;
    if (o.e > this.e) { big = o; small = this; }
    const diff = big.e - small.e;
    if (diff > 17) return big.clone();
    const m = big.m + small.m / Math.pow(10, diff);
    return new Dec(m, big.e).normalize();
  }

  sub(other) { return this.add(Dec.from(other).neg()); }

  mul(other) {
    const o = Dec.from(other);
    return new Dec(this.m * o.m, this.e + o.e).normalize();
  }

  div(other) {
    const o = Dec.from(other);
    return new Dec(this.m / o.m, this.e - o.e).normalize();
  }

  recip() { return new Dec(1 / this.m, -this.e).normalize(); }

  cmp(other) {
    const o = Dec.from(other);
    if (this.m === 0) return o.m === 0 ? 0 : (o.m > 0 ? -1 : 1);
    if (o.m === 0) return this.m > 0 ? 1 : -1;
    if (this.m > 0 && o.m < 0) return 1;
    if (this.m < 0 && o.m > 0) return -1;
    const sgn = Math.sign(this.m);
    if (this.e > o.e) return sgn;
    if (this.e < o.e) return -sgn;
    if (this.m > o.m) return 1;
    if (this.m < o.m) return -1;
    return 0;
  }

  gt(o) { return this.cmp(o) > 0; }
  gte(o) { return this.cmp(o) >= 0; }
  lt(o) { return this.cmp(o) < 0; }
  lte(o) { return this.cmp(o) <= 0; }
  eq(o) { return this.cmp(o) === 0; }

  max(o) { return this.gte(o) ? this : Dec.from(o); }
  min(o) { return this.lte(o) ? this : Dec.from(o); }

  // log10 of a positive Dec, returned as a plain number
  log10() {
    if (this.m <= 0) return NaN;
    return this.e + Math.log10(this.m);
  }

  ln() { return this.log10() * Math.LN10; }
  log(base) { return this.log10() / Math.log10(base); }

  // 10^x where x is a plain number (may be huge)
  static pow10(x) {
    if (!isFinite(x)) return x > 0 ? new Dec(1, EXP_LIMIT) : new Dec(0, 0);
    const e = Math.floor(x);
    const m = Math.pow(10, x - e);
    return new Dec(m, e).normalize();
  }

  // this^n for plain-number n
  pow(n) {
    if (this.m === 0) return n === 0 ? new Dec(1, 0) : new Dec(0, 0);
    if (this.m < 0) {
      // Only integer exponents are meaningful for negatives
      const r = this.abs().pow(n);
      return (Math.round(n) % 2 !== 0) ? r.neg() : r;
    }
    return Dec.pow10(this.log10() * n);
  }

  sqrt() { return this.pow(0.5); }
  cbrt() { return this.pow(1 / 3); }

  static exp(x) { return Dec.pow10(x / Math.LN10); }

  floor() {
    if (this.e >= 17) return this.clone();
    return Dec.fromNumber(Math.floor(this.toNumber()));
  }

  round() {
    if (this.e >= 17) return this.clone();
    return Dec.fromNumber(Math.round(this.toNumber()));
  }

  toJSON() { return { m: this.m, e: this.e }; }

  toString() {
    if (this.m === 0) return '0';
    if (this.e > -7 && this.e < 21) return String(this.toNumber());
    return this.m.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + 'e' + this.e;
  }
}

// ---- helpers for exponential cost curves ----
// Cost of the n-th purchase (0-indexed): base * r^n
Dec.costOf = function (base, r, n) {
  return Dec.from(base).mul(Dec.pow10(Math.log10(r) * n));
};
// Total cost of purchases [n, n+count): base * r^n * (r^count - 1)/(r - 1)
Dec.costSum = function (base, r, n, count) {
  if (count <= 0) return new Dec(0, 0);
  if (r === 1) return Dec.costOf(base, r, n).mul(count);
  const geo = Dec.pow10(Math.log10(r) * count).sub(1).div(r - 1);
  return Dec.costOf(base, r, n).mul(geo);
};
// Max purchases affordable starting at index n with given money
Dec.affordable = function (money, base, r, n) {
  const M = Dec.from(money);
  const first = Dec.costOf(base, r, n);
  if (M.lt(first)) return 0;
  if (r === 1) return Math.floor(M.div(first).toNumber());
  // count = floor( log_r( money*(r-1)/(base*r^n) + 1 ) )
  const x = M.mul(r - 1).div(first).add(1);
  const count = Math.floor(x.log10() / Math.log10(r) + 1e-9);
  return Math.max(count, 1);
};

global.Dec = Dec;
})(typeof window !== 'undefined' ? window : globalThis);
