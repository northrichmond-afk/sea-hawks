import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Toast, useToast } from '../../components.jsx'
import { fmtDate, fmtTime, fullName, STATUS_LABELS } from '../../lib/format.js'

const STATUSES = ['present', 'late', 'absent', 'excused']

export default function Register() {
  const { id } = useParams()
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [toast, showToast] = useToast()
  const [dirty, setDirty] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)

  const { data, error, loading } = useLoad(async () => {
    const session = await q(supabase.from('sessions').select('*, squads(name)').eq('id', id).single())
    const [players, attendance] = await Promise.all([
      q(supabase.from('players').select('id, first_name, last_name, status')
        .eq('squad_id', session.squad_id).order('first_name').order('last_name')),
      q(supabase.from('attendance').select('player_id, status').eq('session_id', id)),
    ])
    const marked = Object.fromEntries(attendance.map((a) => [a.player_id, a.status]))
    // Show active players, plus anyone already marked (e.g. since left)
    const list = players.filter((p) => p.status === 'active' || marked[p.id])
    return { session, players: list, marked, alreadyMarked: attendance.length > 0 }
  }, [id])

  useEffect(() => {
    if (!data) return
    const m = {}
    for (const p of data.players) m[p.id] = data.marked[p.id] || 'absent'
    setMarks(m)
    setDirty(false)
  }, [data])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { session, players, alreadyMarked } = data

  const set = (pid, st) => { setMarks((m) => ({ ...m, [pid]: st })); setDirty(true) }
  const allPresent = () => { setMarks(Object.fromEntries(players.map((p) => [p.id, 'present']))); setDirty(true) }
  const count = (st) => Object.values(marks).filter((v) => v === st).length

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const rows = players.map((p) => ({ session_id: id, player_id: p.id, status: marks[p.id] }))
      await q(supabase.from('attendance').upsert(rows, { onConflict: 'session_id,player_id' }))
      setDirty(false)
      setSavedOnce(true)
      showToast('Register saved ✓')
    } catch (e) { setSaveError(e) } finally { setSaving(false) }
  }

  return (
    <div className="register">
      <Link to="/today" className="muted">← Registers</Link>
      <h1>{session.squads?.name} register</h1>
      <p className="muted">{fmtDate(session.session_date)} · {fmtTime(session.start_time)}–{fmtTime(session.end_time)} · {session.venue}</p>
      {session.cancelled && <div className="error">This session is cancelled. Nobody will be charged.</div>}
      {!alreadyMarked && !session.cancelled && <p className="hint">Everyone starts as Absent. Tap each player who came, or use “All present”.</p>}

      <div className="row between sticky">
        <span>✅ {count('present')} · ⏰ {count('late')} · ❌ {count('absent')} · 📝 {count('excused')}</span>
        <button onClick={allPresent}>All present</button>
      </div>

      {players.length === 0 && <p className="muted">No players in this squad yet.</p>}
      <ul className="register-list">
        {players.map((p) => (
          <li key={p.id}>
            <span className="name">{fullName(p)}</span>
            <div className="seg">
              {STATUSES.map((st) => (
                <button key={st} className={`seg-${st} ${marks[p.id] === st ? 'on' : ''}`}
                  onClick={() => set(p.id, st)}>{STATUS_LABELS[st]}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <ErrorBox error={saveError} />
      <div className="savebar">
        <button className="primary big" disabled={saving || players.length === 0} onClick={save}>
          {saving ? 'Saving…' : !dirty && (alreadyMarked || savedOnce) ? 'Saved ✓' : 'Save register'}
        </button>
      </div>
      <Toast msg={toast} />
    </div>
  )
}
