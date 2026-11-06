import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading } from '../../components.jsx'
import { money, fmtDate, fmtTime, STATUS_LABELS, isoDate } from '../../lib/format.js'

// Parent view. Security rules mean only their own children come back.
export default function MyChildren() {
  const { data, error, loading } = useLoad(async () => {
    const [balances, attendance, payments, upcoming, settings] = await Promise.all([
      q(supabase.from('player_balances').select('*').order('first_name')),
      q(supabase.from('attendance').select('player_id, status, sessions(session_date, start_time, fee, cancelled)')
        .order('marked_at', { ascending: false }).limit(200)),
      q(supabase.from('payments').select('player_id, amount, paid_on').order('paid_on', { ascending: false })),
      q(supabase.from('sessions').select('id, squad_id, session_date, start_time, end_time, venue, cancelled')
        .gte('session_date', isoDate()).order('session_date').limit(30)),
      q(supabase.from('club_settings').select('*').single()),
    ])
    return { balances, attendance, payments, upcoming, settings }
  })

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { balances, attendance, payments, upcoming, settings } = data
  const total = balances.reduce((t, b) => t + Math.max(0, Number(b.balance)), 0)

  return (
    <div>
      <h1>My children</h1>
      {total > 0 && (
        <div className="card pay">
          <h3>How to pay — {money(total)} due</h3>
          <p>Bank transfer to <b>{settings.bank_account_name}</b><br />
            Sort code <b>{settings.bank_sort_code}</b> · Account <b>{settings.bank_account_no}</b></p>
          <p>Reference: {balances.filter((b) => b.balance > 0).map((b) => <code key={b.player_id}>{b.payment_ref}</code>)
            .reduce((a, c) => (a.length ? [...a, ' + ', c] : [c]), [])}</p>
          <p className="muted small">{settings.payment_note} Payments are marked by the club when they arrive, so it may take a few days to show.</p>
        </div>
      )}

      {balances.map((b) => {
        const att = attendance.filter((a) => a.player_id === b.player_id && a.sessions)
          .sort((x, y) => y.sessions.session_date.localeCompare(x.sessions.session_date))
        const pays = payments.filter((p) => p.player_id === b.player_id)
        const next = upcoming.filter((s) => s.squad_id === b.squad_id).slice(0, 3)
        const attended = att.filter((a) => ['present', 'late'].includes(a.status) && !a.sessions.cancelled).length
        return (
          <section key={b.player_id} className="card child">
            <div className="row between">
              <h2>{b.first_name} {b.last_name}</h2>
              <span className="pill">{b.squad_name}</span>
            </div>
            <div className="stats">
              <div className="stat"><span>Balance</span>
                <b className={b.balance > 0 ? 'owing' : ''}>{b.balance < 0 ? `${money(-b.balance)} credit` : money(b.balance)}</b></div>
              <div className="stat"><span>Sessions attended</span><b>{attended}</b></div>
              <div className="stat"><span>Payment ref</span><b><code>{b.payment_ref}</code></b></div>
            </div>

            {next.length > 0 && <>
              <h4>Next sessions</h4>
              <ul className="plain">{next.map((s) => (
                <li key={s.id}>{fmtDate(s.session_date)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.venue}
                  {s.cancelled && <span className="pill red">Cancelled</span>}</li>
              ))}</ul>
            </>}

            <h4>Recent attendance</h4>
            {att.length === 0 ? <p className="muted">No sessions yet.</p> : (
              <table><tbody>{att.slice(0, 12).map((a, i) => (
                <tr key={i}>
                  <td>{fmtDate(a.sessions.session_date)}</td>
                  <td>{a.sessions.cancelled ? 'Cancelled' : STATUS_LABELS[a.status]}</td>
                  <td className="num">{!a.sessions.cancelled && ['present', 'late'].includes(a.status) ? money(a.sessions.fee) : ''}</td>
                </tr>
              ))}</tbody></table>
            )}

            <h4>Payments</h4>
            {pays.length === 0 ? <p className="muted">None recorded yet.</p> : (
              <table><tbody>{pays.slice(0, 12).map((p, i) => (
                <tr key={i}><td>{fmtDate(p.paid_on)}</td><td className="num">{money(p.amount)}</td></tr>
              ))}</tbody></table>
            )}
          </section>
        )
      })}
    </div>
  )
}
