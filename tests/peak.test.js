import test from 'node:test';
import assert from 'node:assert/strict';

import { PEAK_WINDOWS, beijingParts, inPeakWindow, isPeak } from '../src/host/peak.js';

/** Beijing wall-clock -> epoch ms. Written out so the tests do not share the code's own arithmetic. */
function bj(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - 8 * 3_600_000;
}

/** Holiday predicate over an explicit set of Beijing dates. */
function holidays(...dates) {
  const set = new Set(dates);
  return (date) => set.has(date);
}

test('peak windows are the two DeepSeek windows', () => {
  assert.deepEqual(PEAK_WINDOWS, [
    [9, 12],
    [14, 18],
  ]);
});

test('beijingParts reads Beijing, not UTC', () => {
  // 2026-10-19 00:30 UTC is 08:30 in Beijing on the same calendar day.
  const parts = beijingParts(Date.UTC(2026, 9, 19, 0, 30));
  assert.equal(parts.date, '2026-10-19');
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 30);
  assert.equal(parts.weekday, 1); // Monday

  // 2026-10-18 20:00 UTC is already Monday 04:00 in Beijing.
  const rolled = beijingParts(Date.UTC(2026, 9, 18, 20, 0));
  assert.equal(rolled.date, '2026-10-19');
  assert.equal(rolled.hour, 4);
});

test('window boundary cases', () => {
  const monday = '2026-10-19';
  assert.equal(isPeak(bj(monday, '08:59')), false, 'Monday 08:59 is off-peak');
  assert.equal(isPeak(bj(monday, '09:00')), true, 'Monday 09:00 is peak');
  assert.equal(isPeak(bj(monday, '11:59')), true, 'Monday 11:59 is peak');
  assert.equal(isPeak(bj(monday, '12:00')), false, 'Monday 12:00 (lunch) is off-peak');
  assert.equal(isPeak(bj(monday, '13:59')), false, 'Monday 13:59 (lunch) is off-peak');
  assert.equal(isPeak(bj(monday, '14:00')), true, 'Monday 14:00 is peak');
  assert.equal(isPeak(bj(monday, '17:59')), true, 'Monday 17:59 is peak');
  assert.equal(isPeak(bj(monday, '18:00')), false, 'Monday 18:00 is off-peak');
});

test('the minute before a boundary is peak, the boundary itself is not', () => {
  // 09:59:59 is inside; 10:00:00 is inside; 11:59:59.999 is inside; 12:00:00 is not.
  const at = (time) => bj('2026-10-20', time);
  assert.equal(isPeak(at('09:59')), true);
  assert.equal(isPeak(at('11:59')), true);
  assert.equal(isPeak(at('12:00')), false);
  assert.equal(isPeak(at('17:59')), true);
  assert.equal(isPeak(at('18:00')), false);
});

test('weekends are off-peak all day', () => {
  assert.equal(isPeak(bj('2026-10-24', '10:00')), false, 'Saturday 10:00');
  assert.equal(isPeak(bj('2026-10-25', '15:00')), false, 'Sunday 15:00');
  assert.equal(isPeak(bj('2026-10-25', '09:30')), false, 'Sunday inside a window');
});

test('Friday inside a window is peak', () => {
  // 2026-10-23 is a Friday.
  assert.equal(isPeak(bj('2026-10-23', '10:00')), true);
  assert.equal(isPeak(bj('2026-10-23', '18:00')), false);
});

test('a public holiday is off-peak even inside a window on a weekday', () => {
  // 2026-10-01 is a Thursday and a public holiday.
  assert.equal(isPeak(bj('2026-10-01', '10:00'), holidays('2026-10-01')), false);
  // The DEFAULT calendar is the shipped one: forgetting the argument must not
  // silently bill a holiday at the peak rate. (It did: the fold called
  // `isPeak()` bare while the price display used the calendar, so a National
  // Day call was billed peak and shown off-peak.)
  assert.equal(isPeak(bj('2026-10-01', '10:00')), false);
  // An explicitly empty calendar is the only way to opt out.
  assert.equal(isPeak(bj('2026-10-01', '10:00'), () => false), true);
  // A neighbouring workday still bills peak.
  assert.equal(isPeak(bj('2026-10-09', '10:00'), holidays('2026-10-01')), true);
  assert.equal(isPeak(bj('2026-10-29', '10:00')), true, 'an ordinary weekday window is peak by default');
});

test('a make-up Saturday stays off-peak', () => {
  // 2026-02-14 is a Saturday declared a working day by the 调休 arrangement.
  // The published rule names weekdays and carves out only public holidays, so a
  // make-up workday is NOT peak.
  assert.equal(isPeak(bj('2026-02-14', '10:00'), holidays()), false);
});

test('inPeakWindow ignores the calendar, isPeak does not', () => {
  const saturday = bj('2026-10-24', '10:00');
  assert.equal(inPeakWindow(saturday), true);
  assert.equal(isPeak(saturday), false);
});

test('a non-finite timestamp is never peak', () => {
  assert.equal(isPeak(undefined), false);
  assert.equal(isPeak(null), false);
  assert.equal(isPeak(Number.NaN), false);
  assert.equal(isPeak(Number.POSITIVE_INFINITY), false);
});
