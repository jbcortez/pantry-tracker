/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Whole days from today until `isoDate` (negative when past). */
export function daysUntil(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

export function describeUseBy(isoDate: string, now = new Date()): string {
  const n = daysUntil(isoDate, now)
  if (n < -1) return `Expired ${-n}d ago`
  if (n === -1) return 'Expired yesterday'
  if (n === 0) return 'Use today'
  if (n === 1) return 'Use tomorrow'
  if (n <= 14) return `${n} days`
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

export type Urgency = 'expired' | 'soon' | 'ok'

export const SOON_DAYS = 3

export function urgency(isoDate: string | null, now = new Date()): Urgency {
  if (!isoDate) return 'ok'
  const n = daysUntil(isoDate, now)
  if (n < 0) return 'expired'
  if (n <= SOON_DAYS) return 'soon'
  return 'ok'
}
