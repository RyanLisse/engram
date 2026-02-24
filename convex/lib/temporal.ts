/**
 * Temporal anchoring: extract referenced dates from fact content.
 *
 * Pure regex-based — no external date parsing libraries.
 * Conservative: better to miss a date than extract a wrong one.
 */

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Keywords that signal the date following them is the important one. */
const ANCHOR_KEYWORDS = /(?:deadline|due|by|on|scheduled|until|before|after|starting|from)\s+/i;

interface DateCandidate {
  date: Date;
  index: number;
  anchored: boolean; // preceded by a keyword like "deadline", "due", etc.
}

/**
 * Build a Date from components, returning null if invalid.
 * Month is 0-indexed (JS convention).
 */
function safeDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (year < 2020 || year > 2035) return null;

  const d = new Date(year, month, day, 12, 0, 0, 0); // noon to avoid TZ edge cases
  // Verify the date didn't roll over (e.g. Feb 30 -> Mar 2)
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

/** Infer a 4-digit year from a 2-digit year. */
function expandYear(twoDigit: number): number {
  return twoDigit >= 0 && twoDigit <= 50 ? 2000 + twoDigit : 1900 + twoDigit;
}

/** Check if the text just before `index` contains an anchor keyword. */
function hasAnchorBefore(content: string, index: number): boolean {
  const prefix = content.slice(Math.max(0, index - 30), index);
  return ANCHOR_KEYWORDS.test(prefix);
}

/**
 * Extract a referenced date from fact content.
 * Returns Unix timestamp (milliseconds) or null.
 *
 * Supported patterns:
 * - "March 15, 2026" / "March 15" / "Mar 15"
 * - "2026-03-15" (ISO format)
 * - "3/15/2026" or "3/15/26"
 * - "tomorrow" / "yesterday"
 * - "next Monday" / "next week"
 * - "in 3 days" / "in 2 weeks"
 *
 * If multiple dates found, prefers the one after anchor keywords
 * (deadline, due, by, on, scheduled).
 */
export function extractReferencedDate(content: string, now?: number): number | null {
  const candidates: DateCandidate[] = [];
  const referenceDate = now ? new Date(now) : new Date();

  // ── Pattern 1: "March 15, 2026" or "March 15" or "Mar 15, 2026"
  const namedMonthRe = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = namedMonthRe.exec(content)) !== null) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    const year = m[3] ? parseInt(m[3], 10) : referenceDate.getFullYear();
    if (month === undefined) continue;
    const d = safeDate(year, month, day);
    if (d) {
      candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
    }
  }

  // ── Pattern 2: ISO format "2026-03-15"
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = isoRe.exec(content)) !== null) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1; // 0-indexed
    const day = parseInt(m[3], 10);
    const d = safeDate(year, month, day);
    if (d) {
      candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
    }
  }

  // ── Pattern 3: "3/15/2026" or "3/15/26"
  const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  while ((m = slashRe.exec(content)) !== null) {
    const monthNum = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year = expandYear(year);
    const d = safeDate(year, monthNum, day);
    if (d) {
      candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
    }
  }

  // ── Pattern 4: Relative dates — "tomorrow", "yesterday"
  const tomorrowRe = /\btomorrow\b/gi;
  while ((m = tomorrowRe.exec(content)) !== null) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
  }

  const yesterdayRe = /\byesterday\b/gi;
  while ((m = yesterdayRe.exec(content)) !== null) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
  }

  // ── Pattern 5: "next Monday", "next Tuesday", etc.
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const nextDayRe = /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  while ((m = nextDayRe.exec(content)) !== null) {
    const targetDay = dayNames[m[1].toLowerCase()];
    if (targetDay === undefined) continue;
    const d = new Date(referenceDate);
    const currentDay = d.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    d.setDate(d.getDate() + daysAhead);
    d.setHours(12, 0, 0, 0);
    candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
  }

  // ── Pattern 6: "next week" (7 days from now)
  const nextWeekRe = /\bnext\s+week\b/gi;
  while ((m = nextWeekRe.exec(content)) !== null) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 7);
    d.setHours(12, 0, 0, 0);
    candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
  }

  // ── Pattern 7: "in N days" / "in N weeks"
  const inNDaysRe = /\bin\s+(\d{1,3})\s+(days?|weeks?)\b/gi;
  while ((m = inNDaysRe.exec(content)) !== null) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const d = new Date(referenceDate);
    if (unit.startsWith("day")) {
      d.setDate(d.getDate() + n);
    } else {
      d.setDate(d.getDate() + n * 7);
    }
    d.setHours(12, 0, 0, 0);
    candidates.push({ date: d, index: m.index, anchored: hasAnchorBefore(content, m.index) });
  }

  if (candidates.length === 0) return null;

  // Prefer anchored candidates (preceded by "deadline", "due", "by", "on", etc.)
  const anchored = candidates.filter((c) => c.anchored);
  if (anchored.length > 0) {
    return anchored[0].date.getTime();
  }

  // Otherwise return the first date found
  return candidates[0].date.getTime();
}
