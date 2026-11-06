import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading } from '../../components.jsx'
import { fmtDate, fmtTime, isoDate, addDays } from '../../lib/format.js'

// Coach home: sessions from last week to next week, today first.
export default function Today() {
  const today = isoDate()
  const [squad, setSquad] = useState('')
  const { data, error, loading } = useLoad(async () => {
    const [sessions, squads, counts] = await Promise.all([
      q(supabase.from('sessions').select('*, squads(name)')
        .gte('session_date', addDays(today, -7)).lte('session_date', addDays(today, 7))
        .order('session_date').order('start_time')),
      q(supabase.from('squads').select('id, name').eq('active', true).order('name')),
      q(supabase.from('session_headcounts').select('session_id, marked, present, late')
        .gte('session_date', addDays(today, -7)).lte('session_date', addDays(today, 7))),
    ])
    const byId = Object.fromEntries(counts.map((c) => [c.session_id, c]))
    return { sessions: sessions.map((s) => ({ ...s, count: byId[s.id] })), squads }
  }, [today])

  if (loading) return <Loading />
  const list = (data?.sessions || []).filter((s) => !squad || s.squad_id === squad)
  const groups = {
    Today: list.filter((s) => s.session_date === today),
    Upcoming: list.filter((s) => s.session_date > today),
    'Last 7 days': list.filter((s) => s.session_date < today).reverse(),
  }

  return (
    <div>
      <div className="row between">
        <h1>Registers</h1>
        <select value={squad} onChange={(e) => setSquad(e.target.value)}>
          <option value="">All squads</option>
          {data?.squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {Object.entries(groups).map(([title, items]) => (
        <section key={title}>
          <h3>{title}</h3>
          {items.length === 0 && <p className="muted">No sessions.</p>}
          <div className="cards">
            {items.map((s) => (
              <Link key={s.id} to={`/register/${s.id}`} className={`card session ${s.cancelled ? 'cancelled' : ''}`}>
                <div className="row between">
                  <b>{s.squads?.name}</b>
                  {s.cancelled ? <span className="pill red">Cancelled</span>
                    : s.count?.marked ? <span className="pill green">{(s.count.present || 0) + (s.count.late || 0)} attended</span>
                    : <span className="pill">Not marked</span>}
                </div>
                <div>{fmtDate(s.session_date)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
                <div className="muted">{s.venue}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
