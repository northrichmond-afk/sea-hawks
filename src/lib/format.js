const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
export const money = (n) => gbp.format(Number(n || 0))

export const fmtDate = (d) =>
  d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) : ''

export const fmtTime = (t) => (t ? t.slice(0, 5) : '')

// yyyy-mm-dd in local time
export const isoDate = (date = new Date()) => {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export const fullName = (p) => (p ? `${p.first_name} ${p.last_name}` : '')

export const STATUS_LABELS = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' }
