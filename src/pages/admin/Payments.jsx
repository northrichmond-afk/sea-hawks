import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Field, Toast, useToast } from '../../components.jsx'
import { money, fmtDate, isoDate, fullName } from '../../lib/format.js'

// Payments tab: who owes what, and "Mark paid" when a bank transfer arrives.
// "By family" groups siblings who share a guardian, for one-transfer families.
export default function Payments() {
  const [view, setView] = useState('family')
  const [onlyOwing, setOnlyOwing] = useState(true)
  const [squad, setSquad] = useState('')
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState(null) // { title, players: [...] }
  const [toast, showToast] = useToast()
  const [err, setErr] = useState(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [balances, links, squads, recent] = await Promise.all([
      q(supabase.from('player_balances').select('*').order('last_name')),
      q(supabase.from('player_guardians').select('player_id, guardian_id, guardians(full_name)')),
      q(supabase.from('squads').select('id, name').order('name')),
      q(supabase.from('payments').select('*, players(first_name, last_name, payment_ref)')
        .order('created_at', { ascending: false }).limit(15)),
    ])
    return { balances, links, squads, recent }
  })

  const families = useMemo(() => {
    if (!data) return []
    // Union players that share any guardian into one family
    const parent = {}
    const find = (x) => (parent[x] === x || parent[x] === undefined ? (parent[x] = x) : (parent[x] = find(parent[x])))
    const byGuardian = {}
    const gName = {}
    for (const l of data.links) {
      (byGuardian[l.guardian_id] ||= []).push(l.player_id)
      ;(gName[l.player_id] ||= []).push(l.guardians?.full_name)
    }
    for (const ps of Object.values(byGuardian)) for (const p of ps.slice(1)) parent[find(p)] = find(ps[0])
    const groups = {}
    for (const b of data.balances) (groups[find(b.player_id)] ||= []).push(b)
    return Object.values(groups).map((players) => ({
      key: players[0].player_id,
      title: [...new Set(players.flatMap((p) => gName[p.player_id] || []))].join(' & ') || 'No guardian linked',
      players,
      balance: players.reduce((s, p) => s + Number(p.balance), 0),
    }))
  }, [data])

  if (loading && !data) return <Loading />
  const s = search.trim().toLowerCase()
  const matchPlayer = (p) => (!squad || p.squad_id === squad) &&
    (!s || `${fullName(p)} ${p.payment_ref}`.toLowerCase().includes(s))

  const rows = view === 'family'
    ? families.filter((f) => f.players.some(matchPlayer) || (s && f.title.toLowerCase().includes(s) && (!squad || f.players.some((p) => p.squad_id === squad))))
      .filter((f) => !onlyOwing || f.balance > 0)
      .sort((a, b) => b.balance - a.balance)
    : (data?.balances || []).filter(matchPlayer).filter((p) => !onlyOwing || Number(p.balance) > 0)
      .map((p) => ({ key: p.player_id, title: fullName(p), players: [p], balance: Number(p.balance) }))
      .sort((a, b) => b.balance - a.balance)

  const totalOwed = (data?.balances || []).reduce((t, p) => t + Math.max(0, Number(p.balance)), 0)

  async function undo(pay) {
    if (!confirm(`Delete payment of ${money(pay.amount)} for ${fullName(pay.players)}?`)) return
    setErr(null)
    try { await q(supabase.from('payments').delete().eq('id', pay.id)); reload() } catch (e) { setErr(e) }
  }

  return (
    <div>
      <h1>Payments</h1>
      <div className="stats">
        <div className="stat"><span>Total owed</span><b>{money(totalOwed)}</b></div>
        <div className="stat"><span>{view === 'family' ? 'Families' : 'Players'} owing</span>
          <b>{(view === 'family' ? families : (data?.balances || [])).filter((x) => Number(x.balance) > 0).length}</b></div>
      </div>
      <ErrorBox error={error || err} />

      <div className="filters">
        <div className="seg">
          <button className={view === 'family' ? 'on' : ''} onClick={() => setView('family')}>By family</button>
          <button className={view === 'player' ? 'on' : ''} onClick={() => setView('player')}>By player</button>
        </div>
        <input placeholder="Search name or ref (e.g. SH012)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={squad} onChange={(e) => setSquad(e.target.value)}>
          <option value="">All squads</option>
          {data?.squads.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} /> Only owing</label>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>{view === 'family' ? 'Family' : 'Player'}</th><th>Players</th><th className="num">Owes</th><th>Last paid</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.title}</b></td>
                <td>{r.players.map((p) => (
                  <div key={p.player_id}>
                    <Link to={`/players/${p.player_id}`}>{fullName(p)}</Link>{' '}
                    <code>{p.payment_ref}</code> <span className="muted">{p.squad_name}</span>
                    {r.players.length > 1 && <span className="muted"> · {money(p.balance)}</span>}
                  </div>
                ))}</td>
                <td className={`num ${r.balance > 0 ? 'owing' : r.balance < 0 ? 'credit' : ''}`}>
                  {r.balance < 0 ? `${money(-r.balance)} credit` : money(r.balance)}</td>
                <td>{(() => {
                  const d = r.players.map((p) => p.last_paid_on).filter(Boolean).sort().pop()
                  return d ? fmtDate(d) : <span className="muted">Never</span>
                })()}</td>
                <td><button className="primary" onClick={() => setPaying(r)}>Mark paid</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="muted">{onlyOwing ? 'Nobody owes anything 🎉' : 'No matches.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Recently recorded</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Paid on</th><th>Player</th><th className="num">Amount</th><th>Bank ref</th><th>By</th><th></th></tr></thead>
          <tbody>
            {data?.recent.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.paid_on)}</td>
                <td>{fullName(p.players)} <code>{p.players?.payment_ref}</code></td>
                <td className="num">{money(p.amount)}</td>
                <td>{p.bank_ref}</td>
                <td className="muted small">{p.recorded_by}</td>
                <td><button className="link danger" onClick={() => undo(p)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paying && <PayForm group={paying} onClose={() => setPaying(null)}
        onDone={(msg) => { setPaying(null); showToast(msg); reload() }} />}
      <Toast msg={toast} />
    </div>
  )
}

// Split a family payment: clear each child's balance (largest first),
// any extra goes to the first child as credit.
function allocate(players, amount) {
  let left = Math.round(amount * 100)
  const out = players.map((p) => ({ p, cents: 0 }))
  const order = [...out].sort((a, b) => Number(b.p.balance) - Number(a.p.balance))
  for (const o of order) {
    const owe = Math.max(0, Math.round(Number(o.p.balance) * 100))
    const take = Math.min(owe, left)
    o.cents += take
    left -= take
  }
  if (left > 0) order[0].cents += left
  return out.filter((o) => o.cents > 0).map((o) => ({ player: o.p, amount: o.cents / 100 }))
}

function PayForm({ group, onClose, onDone }) {
  const owed = Math.max(0, group.balance)
  const [amount, setAmount] = useState(owed ? owed.toFixed(2) : '')
  const [paidOn, setPaidOn] = useState(isoDate())
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const amt = Number(amount)
  const split = amt > 0 ? allocate(group.players, amt) : []

  async function save(e) {
    e.preventDefault()
    if (!(amt > 0)) return
    setBusy(true); setErr(null)
    try {
      await q(supabase.from('payments').insert(split.map((s) => ({
        player_id: s.player.player_id, amount: s.amount, paid_on: paidOn,
        bank_ref: ref || null, notes: notes || null,
      }))))
      onDone(`Recorded ${money(amt)} for ${group.title} ✓`)
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="card form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>Mark paid — {group.title}</h3>
        <p className="muted">Currently owes {money(owed)}</p>
        <div className="grid2">
          <Field label="Amount received £"><input type="number" step="0.01" min="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date received"><input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
          <Field label="Bank reference"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="As shown on statement" /></Field>
          <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        {group.players.length > 1 && split.length > 0 && (
          <div className="muted small">Split: {split.map((s) => `${s.player.first_name} ${money(s.amount)}`).join(' · ')}</div>
        )}
        <ErrorBox error={err} />
        <div className="row">
          <button className="primary" disabled={busy || !(amt > 0)}>{busy ? 'Saving…' : 'Record payment'}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
