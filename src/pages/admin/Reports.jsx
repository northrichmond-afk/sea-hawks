import { useState } from 'react'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Field } from '../../components.jsx'
import { money, fmtDate, fmtTime, isoDate, addDays, fullName } from '../../lib/format.js'
import { downloadCsv } from '../../lib/csv.js'

const REPORTS = {
  owing: 'Outstanding balances',
  payments: 'Payments received',
  monthly: 'Monthly charges vs payments',
  attendance: 'Attendance by player',
  headcount: 'Session headcounts',
  contacts: 'Contact list',
}

export default function Reports() {
  const today = isoDate()
  const [report, setReport] = useState('owing')
  const [from, setFrom] = useState(addDays(today, -90))
  const [to, setTo] = useState(today)
  const needsDates = ['payments', 'monthly', 'attendance', 'headcount'].includes(report)

  return (
    <div>
      <h1>Reports</h1>
      <div className="filters">
        <Field label="Report">
          <select value={report} onChange={(e) => setReport(e.target.value)}>
            {Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {needsDates && <>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </>}
      </div>
      <Report key={report + from + to} report={report} from={from} to={to} />
    </div>
  )
}

function Report({ report, from, to }) {
  const { data, error, loading } = useLoad(() => LOADERS[report](from, to), [report, from, to])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { columns, rows, total } = data
  return (
    <>
      <div className="row between">
        <span className="muted">{rows.length} rows{total ? ` · ${total}` : ''}</span>
        <button onClick={() => downloadCsv(`${report}-${isoDate()}.csv`, rows,
          columns.map((c) => ({ label: c.label, key: c.csv || c.key })))}>⬇ Export CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{columns.map((c) => (
                <td key={c.label} className={c.num ? 'num' : ''}>{c.show ? c.show(r) : (typeof c.key === 'function' ? c.key(r) : r[c.key])}</td>
              ))}</tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length} className="muted">Nothing to show.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

const LOADERS = {
  async owing() {
    const rows = await q(supabase.from('player_balances').select('*').gt('balance', 0)
      .order('balance', { ascending: false }))
    return {
      total: `Total ${money(rows.reduce((t, r) => t + Number(r.balance), 0))}`,
      rows,
      columns: [
        { label: 'Player', key: (r) => fullName(r) },
        { label: 'Ref', key: 'payment_ref' },
        { label: 'Squad', key: 'squad_name' },
        { label: 'Charged', key: 'charged', num: true, show: (r) => money(r.charged) },
        { label: 'Paid', key: 'paid', num: true, show: (r) => money(r.paid) },
        { label: 'Owes', key: 'balance', num: true, show: (r) => money(r.balance) },
        { label: 'Last paid', key: 'last_paid_on', show: (r) => fmtDate(r.last_paid_on) || 'Never' },
        { label: 'Owing since', key: 'oldest_charge', show: (r) => fmtDate(r.oldest_charge) },
      ],
    }
  },
  async payments(from, to) {
    const rows = await q(supabase.from('payments').select('*, players(first_name, last_name, payment_ref)')
      .gte('paid_on', from).lte('paid_on', to).order('paid_on', { ascending: false }))
    return {
      total: `Total ${money(rows.reduce((t, r) => t + Number(r.amount), 0))}`,
      rows,
      columns: [
        { label: 'Paid on', key: 'paid_on', show: (r) => fmtDate(r.paid_on) },
        { label: 'Player', key: (r) => fullName(r.players) },
        { label: 'Ref', key: (r) => r.players?.payment_ref },
        { label: 'Amount', key: 'amount', num: true, show: (r) => money(r.amount) },
        { label: 'Bank ref', key: 'bank_ref' },
        { label: 'Notes', key: 'notes' },
        { label: 'Recorded by', key: 'recorded_by' },
      ],
    }
  },
  async monthly(from, to) {
    const [charges, payments] = await Promise.all([
      q(supabase.from('charges').select('amount, created_at, charge_month').eq('voided', false)),
      q(supabase.from('payments').select('amount, paid_on').gte('paid_on', from).lte('paid_on', to)),
    ])
    const m = {}
    const row = (k) => (m[k] ||= { month: k, charged: 0, paid: 0 })
    for (const c of charges) {
      const d = c.charge_month || c.created_at.slice(0, 10)
      if (d >= from && d <= to) row(d.slice(0, 7)).charged += Number(c.amount)
    }
    for (const p of payments) row(p.paid_on.slice(0, 7)).paid += Number(p.amount)
    const rows = Object.values(m).sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => ({ ...r, difference: r.paid - r.charged }))
    return {
      rows,
      columns: [
        { label: 'Month', key: 'month' },
        { label: 'Charged', key: 'charged', num: true, show: (r) => money(r.charged) },
        { label: 'Paid', key: 'paid', num: true, show: (r) => money(r.paid) },
        { label: 'Paid − charged', key: 'difference', num: true, show: (r) => money(r.difference) },
      ],
    }
  },
  async attendance(from, to) {
    const rows = await q(supabase.rpc('report_attendance', { p_from: from, p_to: to }))
    return {
      rows,
      columns: [
        { label: 'Player', key: (r) => fullName(r) },
        { label: 'Squad', key: 'squad_name' },
        { label: 'Sessions held', key: 'sessions_held', num: true },
        { label: 'Attended', key: 'attended', num: true },
        { label: 'Late', key: 'late', num: true },
        { label: 'Excused', key: 'excused', num: true },
        { label: 'Absent', key: 'absent', num: true },
        { label: 'Attendance %', key: 'attendance_pct', num: true, show: (r) => (r.attendance_pct ?? '—') + (r.attendance_pct != null ? '%' : '') },
      ],
    }
  },
  async headcount(from, to) {
    const rows = await q(supabase.from('session_headcounts').select('*')
      .gte('session_date', from).lte('session_date', to).order('session_date', { ascending: false }))
    return {
      rows,
      columns: [
        { label: 'Date', key: 'session_date', show: (r) => fmtDate(r.session_date) },
        { label: 'Time', key: 'start_time', show: (r) => fmtTime(r.start_time) },
        { label: 'Squad', key: 'squad_name' },
        { label: 'Status', key: (r) => (r.cancelled ? 'Cancelled' : r.marked ? 'Marked' : 'Not marked') },
        { label: 'Present', key: 'present', num: true },
        { label: 'Late', key: 'late', num: true },
        { label: 'Absent', key: 'absent', num: true },
        { label: 'Excused', key: 'excused', num: true },
      ],
    }
  },
  async contacts() {
    const rows = await q(supabase.from('player_guardians')
      .select('relationship, players!inner(first_name, last_name, status, payment_ref, squads(name)), guardians(*)')
      .eq('players.status', 'active'))
    rows.sort((a, b) => (a.players.squads?.name || '').localeCompare(b.players.squads?.name || '') ||
      a.players.last_name.localeCompare(b.players.last_name))
    return {
      rows,
      columns: [
        { label: 'Player', key: (r) => fullName(r.players) },
        { label: 'Squad', key: (r) => r.players.squads?.name },
        { label: 'Guardian', key: (r) => r.guardians.full_name },
        { label: 'Relationship', key: 'relationship' },
        { label: 'Phone', key: (r) => r.guardians.phone },
        { label: 'Email', key: (r) => r.guardians.email },
        { label: 'Address', key: (r) => [r.guardians.address_line1, r.guardians.address_line2, r.guardians.town, r.guardians.postcode].filter(Boolean).join(', ') },
      ],
    }
  },
}
