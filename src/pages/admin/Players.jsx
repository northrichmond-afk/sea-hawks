import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading } from '../../components.jsx'
import { fullName } from '../../lib/format.js'

export default function Players() {
  const [search, setSearch] = useState('')
  const [squad, setSquad] = useState('')
  const [status, setStatus] = useState('active')

  const { data, error, loading } = useLoad(async () => {
    const [players, squads, links] = await Promise.all([
      q(supabase.from('players').select('*, squads(name)').order('last_name').order('first_name')),
      q(supabase.from('squads').select('id, name').order('name')),
      q(supabase.from('player_guardians').select('player_id, guardians(full_name, email, phone)')),
    ])
    const g = {}
    for (const l of links) (g[l.player_id] ||= []).push(l.guardians)
    return { players: players.map((p) => ({ ...p, guardians: g[p.id] || [] })), squads }
  })

  if (loading) return <Loading />
  const s = search.trim().toLowerCase()
  const list = (data?.players || []).filter((p) =>
    (!squad || p.squad_id === squad) &&
    (!status || p.status === status) &&
    (!s || `${fullName(p)} ${p.payment_ref} ${p.guardians.map((g) => g.full_name + ' ' + (g.email || '')).join(' ')}`
      .toLowerCase().includes(s)))

  return (
    <div>
      <div className="row between">
        <h1>Players <span className="muted small">({list.length})</span></h1>
        <Link to="/players/new" className="button primary">+ Add player</Link>
      </div>
      <ErrorBox error={error} />
      <div className="filters">
        <input placeholder="Search name, parent, email, ref…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={squad} onChange={(e) => setSquad(e.target.value)}>
          <option value="">All squads</option>
          {data?.squads.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="left">Left</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Squad</th><th>Ref</th><th>Parent / guardian</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/players/${p.id}`}>{fullName(p)}</Link></td>
                <td>{p.squads?.name || <span className="muted">—</span>}</td>
                <td><code>{p.payment_ref}</code></td>
                <td>{p.guardians.length
                  ? p.guardians.map((g, i) => <div key={i}>{g.full_name} <span className="muted">{g.phone}</span></div>)
                  : <span className="pill red">No guardian</span>}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="4" className="muted">No players found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
