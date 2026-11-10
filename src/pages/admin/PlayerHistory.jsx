import { useState } from 'react'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading } from '../../components.jsx'
import { money, fmtDate, fmtTime, fullName, STATUS_LABELS } from '../../lib/format.js'
import { downloadCsv } from '../../lib/csv.js'
import { monthlyStatement, monthLabel, shortMonth, STATUS_TEXT } from '../../lib/months.js'

// Pop-up showing one player's attendance and their fees/payments statement.
export default function PlayerHistory({ player, onClose }) {
  const [tab, setTab] = useState('attendance')
  const [err, setErr] = useState(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [info, attendance, charges, payments] = await Promise.all([
      q(supabase.from('players').select('joined_on, fee_override, squad_id, squads(name, monthly_fee)').eq('id', player.id).single()),
      q(supabase.from('attendance')
        .select('status, marked_by, sessions(session_date, start_time, venue, cancelled, squads(name))')
        .eq('player_id', player.id)),
      q(supabase.from('charges').select('*').eq('player_id', player.id)),
      q(supabase.from('payments').select('*').eq('player_id', player.id)),
    ])
    const att = attendance.filter((a) => a.sessions)
      .sort((a, b) => b.sessions.session_date.localeCompare(a.sessions.session_date))

    // Statement: oldest first to work out the running balance, then show newest first
    const lines = [
      ...charges.map((c) => ({
        id: c.id, kind: 'charge', date: c.charge_month || c.created_at.slice(0, 10),
        text: c.description || 'Charge', amount: Number(c.amount), voided: c.voided,
      })),
      ...payments.map((p) => ({
        id: p.id, kind: 'payment', date: p.paid_on,
        text: `Payment${p.bank_ref ? ` — ${p.bank_ref}` : ''}`, amount: Number(p.amount), notes: p.notes,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'charge' ? -1 : 1))
    let bal = 0
    for (const l of lines) {
      if (l.kind === 'charge' && !l.voided) bal += l.amount
      if (l.kind === 'payment') bal -= l.amount
      l.balance = bal
    }
    const fee = Number(info.fee_override ?? info.squads?.monthly_fee ?? 0)
    const months = monthlyStatement({ joinedOn: info.joined_on, charges, payments })
    return { att, lines: lines.reverse(), balance: bal, info, fee, months }
  }, [player.id])

  async function toggleWaive(line) {
    const msg = line.voided ? 'Restore this charge?' : 'Waive this charge? It will no longer count towards the balance.'
    if (!confirm(msg)) return
    setErr(null)
    try { await q(supabase.from('charges').update({ voided: !line.voided }).eq('id', line.id)); reload() }
    catch (e) { setErr(e) }
  }

  async function chargeMonths(list) {
    if (!data.fee) { setErr(new Error('This player has no monthly fee — set a squad fee or a fee override first.')); return }
    const what = list.length === 1 ? monthLabel(list[0]) : `${list.length} months (${shortMonth(list[list.length - 1])} – ${shortMonth(list[0])})`
    if (!confirm(`Charge ${what} at ${money(data.fee)} a month?`)) return
    setErr(null)
    try {
      await q(supabase.from('charges').upsert(list.map((m) => ({
        player_id: player.id, charge_month: `${m}-01`, amount: data.fee, description: `Monthly fee ${monthLabel(m)}`,
      })), { onConflict: 'player_id,charge_month', ignoreDuplicates: true }))
      reload()
    } catch (e) { setErr(e) }
  }

  const name = fullName(player)
  const att = data?.att || []
  const counted = att.filter((a) => !a.sessions.cancelled)
  const attended = counted.filter((a) => a.status === 'present' || a.status === 'late').length
  const count = (st) => counted.filter((a) => a.status === st).length

  function exportCsv() {
    if (tab === 'monthly') {
      downloadCsv(`${name} monthly fees.csv`, data.months.rows, [
        { label: 'Month', key: (r) => monthLabel(r.month) },
        { label: 'Fee', key: (r) => (r.charge ? r.amount.toFixed(2) : '') },
        { label: 'Paid', key: (r) => r.paid.toFixed(2) },
        { label: 'Status', key: (r) => STATUS_TEXT[r.status] },
      ])
    } else if (tab === 'attendance') {
      downloadCsv(`${name} attendance.csv`, att, [
        { label: 'Date', key: (a) => a.sessions.session_date },
        { label: 'Time', key: (a) => fmtTime(a.sessions.start_time) },
        { label: 'Squad', key: (a) => a.sessions.squads?.name },
        { label: 'Status', key: (a) => (a.sessions.cancelled ? 'Session cancelled' : STATUS_LABELS[a.status]) },
        { label: 'Marked by', key: 'marked_by' },
      ])
    } else {
      downloadCsv(`${name} statement.csv`, data.lines, [
        { label: 'Date', key: 'date' },
        { label: 'Item', key: 'text' },
        { label: 'Charge', key: (l) => (l.kind === 'charge' ? (l.voided ? 'Waived' : l.amount.toFixed(2)) : '') },
        { label: 'Payment', key: (l) => (l.kind === 'payment' ? l.amount.toFixed(2) : '') },
        { label: 'Balance', key: (l) => l.balance.toFixed(2) },
      ])
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="card history" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h3 className="nomargin">{name} <code>{player.payment_ref}</code></h3>
            {data && <div className="muted small">
              {data.info.squads?.name || 'No squad'} · Joined {fmtDate(data.info.joined_on)} · {money(data.fee)}/month
            </div>}
          </div>
          <button className="link" onClick={onClose}>✕ Close</button>
        </div>

        <div className="row between">
          <div className="seg">
            <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}>Attendance</button>
            <button className={tab === 'monthly' ? 'on' : ''} onClick={() => setTab('monthly')}>Monthly fees</button>
            <button className={tab === 'money' ? 'on' : ''} onClick={() => setTab('money')}>Statement</button>
          </div>
          {data && <button onClick={exportCsv}>⬇ CSV</button>}
        </div>

        <ErrorBox error={error || err} />
        {loading && !data ? <Loading /> : data && tab === 'monthly' && (
          <>
            <div className="stats">
              <div className="stat"><span>Months paid</span><b className="credit">{data.months.paidCount}</b></div>
              <div className="stat"><span>Months due</span>
                <b className={data.months.dueCount ? 'owing' : ''}>{data.months.dueCount}{data.months.dueCount > 0 && <small> · {money(data.months.dueTotal)}</small>}</b></div>
              {data.months.credit > 0 && <div className="stat"><span>In credit</span><b className="credit">{money(data.months.credit)}</b></div>}
            </div>
            {data.months.notCharged.length > 0 && (
              <div className="hint row between">
                <span>{data.months.notCharged.length} month{data.months.notCharged.length === 1 ? '' : 's'} since joining {data.months.notCharged.length === 1 ? 'has' : 'have'} no fee raised.</span>
                <button onClick={() => chargeMonths(data.months.notCharged.map((r) => r.month))}>Charge all</button>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="num">Fee</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {data.months.rows.map((r) => (
                    <tr key={r.month} className={r.status === 'waived' ? 'cancelled' : ''}>
                      <td>{monthLabel(r.month)}</td>
                      <td className="num">{r.charge ? money(r.amount) : '—'}</td>
                      <td>
                        <span className={`mstatus m-${r.status}`}>{STATUS_TEXT[r.status]}</span>
                        {r.status === 'part' && <div className="muted small">{money(r.paid)} of {money(r.amount)}</div>}
                      </td>
                      <td className="actions">
                        {r.status === 'not-charged' && <button className="link small" onClick={() => chargeMonths([r.month])}>Charge</button>}
                        {(r.status === 'due' || r.status === 'part') && <button className="link small" onClick={() => toggleWaive({ id: r.charge.id, voided: false })}>Waive</button>}
                        {r.status === 'waived' && <button className="link small" onClick={() => toggleWaive({ id: r.charge.id, voided: true })}>Restore</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">Payments are applied to the oldest month first. Record payments on the Payments tab.</p>
          </>
        )}
        {data && tab !== 'monthly' && (tab === 'attendance' ? (
          <>
            <div className="stats">
              <div className="stat"><span>Attended</span><b>{attended}</b></div>
              <div className="stat"><span>Attendance</span><b>{counted.length ? Math.round((100 * attended) / counted.length) : 0}%</b></div>
              <div className="stat"><span>Late / Absent / Excused</span><b>{count('late')} / {count('absent')} / {count('excused')}</b></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Squad</th><th>Status</th></tr></thead>
                <tbody>
                  {att.map((a, i) => (
                    <tr key={i} className={a.sessions.cancelled ? 'cancelled' : ''}>
                      <td>{fmtDate(a.sessions.session_date)} <span className="muted">{fmtTime(a.sessions.start_time)}</span></td>
                      <td>{a.sessions.squads?.name}</td>
                      <td>{a.sessions.cancelled ? 'Session cancelled'
                        : <span className={`status-${a.status}`}>{STATUS_LABELS[a.status]}</span>}</td>
                    </tr>
                  ))}
                  {att.length === 0 && <tr><td colSpan="3" className="muted">No registers marked yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="stats">
              <div className="stat"><span>Balance</span>
                <b className={data.balance > 0 ? 'owing' : data.balance < 0 ? 'credit' : ''}>
                  {data.balance < 0 ? `${money(-data.balance)} credit` : money(data.balance)}</b></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th className="num">Amount</th><th className="num">Balance</th></tr></thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.kind + l.id} className={l.voided ? 'cancelled' : ''}>
                      <td>
                        {l.kind === 'payment' ? `Payment received ${fmtDate(l.date)}` : l.text}
                        {l.kind === 'payment' && l.text !== 'Payment' && <div className="muted small">Ref: {l.text.replace('Payment — ', '')}</div>}
                        {l.notes && <div className="muted small">{l.notes}</div>}
                        {l.kind === 'charge' && (
                          <div><button className="link small" onClick={() => toggleWaive(l)}>{l.voided ? 'Restore charge' : 'Waive'}</button></div>)}
                      </td>
                      <td className={`num ${l.kind === 'payment' ? 'credit' : ''}`}>
                        {l.kind === 'payment' ? `−${money(l.amount)}` : l.voided ? 'Waived' : money(l.amount)}</td>
                      <td className="num">{money(l.balance)}</td>
                    </tr>
                  ))}
                  {data.lines.length === 0 && <tr><td colSpan="3" className="muted">No fees or payments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ))}
      </div>
    </div>
  )
}
