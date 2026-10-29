/**
 * Calendar facts in Beijing time (UTC+8 all year, no daylight saving), which
 * the free uses reset by and DeepSeek's peak hours follow.
 */

const OFFSET_MS = 8 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

/**
 * The Beijing date as YYYY-MM-DD, the weekday (0 for Sunday) and the minute
 * of the day.
 */
export function beijingParts(at = new Date()) {
  const shifted = new Date(at.getTime() + OFFSET_MS)
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

export function beijingDate(at = new Date()) {
  return beijingParts(at).date
}

/** The next Beijing midnight. */
export function nextBeijingMidnight(at = new Date()) {
  const shifted = at.getTime() + OFFSET_MS
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS + DAY_MS - OFFSET_MS)
}

/** The start of a YYYY-MM-DD day in Beijing. */
export function beijingDayStart(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - OFFSET_MS)
}

/** Minutes since midnight of an HH:MM time. */
export function minuteOf(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export default {
  beijingParts,
  beijingDate,
  nextBeijingMidnight,
  beijingDayStart,
  minuteOf,
}
