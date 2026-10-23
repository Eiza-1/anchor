// Which seasonal logo (if any) Anchor wears on a given day. Pure date maths, no
// system access. The icons live in main/assets/icons/anchor-<season>.ico.

// Seasons the app actually switches to. The rest are designed and shipped
// (icons, sidebar marks) but stay off until they're added here.
const ACTIVE = new Set(["halloween"]);

/** Western Easter Sunday for `year` (Anonymous Gregorian algorithm). Months are 0-based. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

const DAY = 24 * 60 * 60 * 1000;
const md = (date) => (date.getMonth() + 1) * 100 + date.getDate();   // 1031 = 31 Oct

/**
 * The season a local date falls in, whether or not it's active.
 *   halloween  24 Oct – 1 Nov
 *   christmas  1 – 27 Dec
 *   newyear    28 Dec – 3 Jan
 *   valentines 11 – 15 Feb
 *   easter     Palm Sunday – Easter Monday
 */
function calendarSeason(date) {
  const n = md(date);
  if (n >= 1024 && n <= 1101) return "halloween";
  if (n >= 1201 && n <= 1227) return "christmas";
  if (n >= 1228 || n <= 103) return "newyear";
  if (n >= 211 && n <= 215) return "valentines";
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = Math.round((day - easterSunday(date.getFullYear())) / DAY);
  if (offset >= -7 && offset <= 1) return "easter";
  return null;
}

/** The logo to wear today, or null on an ordinary day or an inactive season. */
function seasonFor(date = new Date()) {
  const s = calendarSeason(date);
  return s && ACTIVE.has(s) ? s : null;
}

module.exports = { easterSunday, calendarSeason, seasonFor };
