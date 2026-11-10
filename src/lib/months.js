import { isoDate } from './format.js'

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export const shortMonth = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Month-by-month fee status for one player, from the month they joined to now.
 * Payments are applied to the oldest unpaid fee first.
 *
 * Each row: { month: 'yyyy-mm', charge, amount, paid, status }
 *   status: 'paid' | 'part' | 'due' | 'waived' | 'not-charged'
 * Returns rows newest first, plus totals and any credit (overpayment).
 */
export function monthlyStatement({ joinedOn, charges = [], payments = [], today = isoDate() }) {
  const thisMonth = today.slice(0, 7)
  const monthly = charges.filter((c) => c.charge_month)
  const other = charges.filter((c) => !c.charge_month && !c.voided) // manual one-off charges

  const firstCharge = monthly.map((c) => c.charge_month.slice(0, 7)).sort()[0]
  let start = [joinedOn?.slice(0, 7), firstCharge].filter(Boolean).sort()[0] || thisMonth
  const lastCharge = monthly.map((c) => c.charge_month.slice(0, 7)).sort().pop()
  const end = lastCharge && lastCharge > thisMonth ? lastCharge : thisMonth

  const byMonth = Object.fromEntries(monthly.map((c) => [c.charge_month.slice(0, 7), c]))
  const rows = []
  for (let m = start; m <= end && rows.length < 240; m = nextMonth(m)) {
    const c = byMonth[m]
    rows.push({ month: m, charge: c || null, amount: c ? Number(c.amount) : 0, paid: 0 })
  }

  // Apply payments oldest-first: one-off charges and monthly fees in date order
  let pot = payments.reduce((t, p) => t + Number(p.amount), 0)
  const queue = [
    ...other.map((c) => ({ key: c.created_at.slice(0, 7), row: null, amount: Number(c.amount) })),
    ...rows.filter((r) => r.charge && !r.charge.voided).map((r) => ({ key: r.month, row: r, amount: r.amount })),
  ].sort((a, b) => a.key.localeCompare(b.key))
  for (const item of queue) {
    const take = Math.min(item.amount, Math.max(0, pot))
    pot = Math.round((pot - take) * 100) / 100
    if (item.row) item.row.paid = take
  }

  for (const r of rows) {
    if (!r.charge) r.status = 'not-charged'
    else if (r.charge.voided) r.status = 'waived'
    else if (r.paid >= r.amount - 0.005) r.status = 'paid'
    else if (r.paid > 0) r.status = 'part'
    else r.status = 'due'
  }

  const due = rows.filter((r) => r.status === 'due' || r.status === 'part')
  return {
    rows: rows.reverse(),
    dueCount: due.length,
    dueTotal: due.reduce((t, r) => t + r.amount - r.paid, 0),
    paidCount: rows.filter((r) => r.status === 'paid').length,
    notCharged: rows.filter((r) => r.status === 'not-charged' && r.month <= thisMonth),
    credit: pot > 0 ? pot : 0,
  }
}

export const STATUS_TEXT = {
  paid: 'Paid', part: 'Part paid', due: 'Due', waived: 'Waived', 'not-charged': 'Not charged',
}
