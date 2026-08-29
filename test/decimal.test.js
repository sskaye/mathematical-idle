'use strict';
require('../js/decimal.js');
require('../js/format.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

// construction / normalize
assert(Dec.fromNumber(0).isZero(), 'zero');
assert(near(Dec.fromNumber(12345).toNumber(), 12345), 'roundtrip 12345');
assert(near(Dec.fromNumber(0.005).toNumber(), 0.005), 'roundtrip 0.005');
assert(Dec.fromNumber(1e100).e === 100, '1e100 exponent');
assert(near(Dec.fromString('1.5e400').log10(), 400 + Math.log10(1.5)), 'fromString big');
assert(Dec.fromString('e1000').e === 1000, 'fromString e1000');

// arithmetic
assert(near(Dec.from(2).add(3).toNumber(), 5), 'add small');
assert(Dec.fromString('1e400').add('1e100').log10() === 400, 'add ignores tiny');
assert(near(Dec.from(7).mul(6).toNumber(), 42), 'mul');
assert(near(Dec.fromString('1e300').mul('1e300').log10(), 600), 'mul big');
assert(near(Dec.fromString('1e600').div('1e300').log10(), 300), 'div big');
assert(near(Dec.from(10).sub(4).toNumber(), 6), 'sub');
assert(Dec.from(5).sub(5).isZero(), 'sub to zero');

// compare
assert(Dec.fromString('1e500').gt('1e499'), 'gt');
assert(Dec.from(-3).lt(2), 'neg lt pos');
assert(Dec.fromString('2e10').eq(Dec.fromString('2e10')), 'eq');
assert(Dec.from(0).lt(1) && Dec.from(0).gt(-1), 'zero compares');

// pow / log
assert(near(Dec.from(2).pow(10).toNumber(), 1024), 'pow 2^10');
assert(near(Dec.fromString('1e100').pow(3).log10(), 300), 'pow big');
assert(near(Dec.pow10(0.5).toNumber(), Math.sqrt(10)), 'pow10 frac');
assert(near(Dec.fromString('1e100').sqrt().log10(), 50), 'sqrt');
assert(near(Dec.from(1000).log10(), 3), 'log10');
assert(near(Dec.exp(10).toNumber(), Math.exp(10), 1e-9), 'exp');

// cost helpers
// base 10, r=2: costs 10,20,40,80... with 100 money starting at n=0 => afford 3 (10+20+40=70; +80=150>100)
assert(Dec.affordable(100, 10, 2, 0) === 3, 'affordable geometric');
assert(near(Dec.costSum(10, 2, 0, 3).toNumber(), 70), 'costSum 70');
assert(near(Dec.costOf(10, 2, 5).toNumber(), 320), 'costOf n=5');
assert(Dec.affordable(5, 10, 2, 0) === 0, 'affordable none');
assert(Dec.affordable(100, 10, 1, 0) === 10, 'affordable r=1');
// huge-range affordability
const aff = Dec.affordable(Dec.fromString('1e100'), 10, 1.5, 0);
assert(near(Math.pow(1.5, aff) * 10 / 0.5 < 1.5e100 ? 1 : 0, 1), 'affordable huge sane');
assert(Dec.costSum(10, 1.5, 0, aff).lte(Dec.fromString('1e100')), 'huge costSum within budget');
assert(Dec.costSum(10, 1.5, 0, aff + 1).gt(Dec.fromString('1e100')), 'huge costSum +1 exceeds');

// format
assert(format(1234) === '1,234', 'format 1234: ' + format(1234));
assert(format(12.345) === '12.35', 'format 12.35: ' + format(12.345));
assert(format(Dec.fromString('1.234e56')) === '1.23e56', 'format sci: ' + format(Dec.fromString('1.234e56')));
assert(format(Dec.fromString('1e2000000')).startsWith('e2'), 'format loglog: ' + format(Dec.fromString('1e2000000')));
assert(formatTime(90) === '1m 30s', 'formatTime 90');
assert(formatTime(3600 * 25) === '1d 1h', 'formatTime day');

// serialization roundtrip
const orig = Dec.fromString('3.7e123');
const back = Dec.from(JSON.parse(JSON.stringify(orig.toJSON())));
assert(back.eq(orig), 'JSON roundtrip');

if (failures === 0) console.log('All decimal/format tests passed.');
else { console.error(failures + ' test(s) failed'); process.exit(1); }
