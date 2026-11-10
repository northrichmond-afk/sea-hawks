import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Field, Toast, useToast } from '../../components.jsx'
import { fmtDate, fmtTime, isoDate, addDays } from '../../lib/format.js'

export default function Sessions() {
  const today = isoDate()
  const [from, setFrom] = useState(addDays(today, -7))
  const [to, setTo] = useState(addDays(today, 42))
  const [squad, setSquad] = useState('')
  const [mode, setMode] = useState(null) // 'single' | 'series'
  const [err, setErr] = useState(null)
  const [toast, showToast] = useToast()

  const { data, error, loading, reload } = useLoad(async () => {
    const [rows, squads] = await Promise.all([
      q(supabase.from('session_headcounts').select('*').gte('session_date', from).lte('session_date', to)
        .order('session_date').order('start_time')),
      q(supabase.from('squads').select('id, name').eq('active', true).order('name')),
    ])
    return { rows, squads }
  }, [from, to])

  async function toggleCancel(s) {
    const msg = s.cancelled ? 'Reinstate this session?' : 'Cancel this session?'
    if (!confirm(msg)) return
    setErr(null)
    try { await q(supabase.from('sessions').update({ cancelled: !s.cancelled }).eq('id', s.session_id)); reload() }
    catch (e) { setErr(e) }
  }

  async function remove(s) {
    if (s.marked > 0) { alert('This session has a register. Cancel it instead of deleting.'); return }
    if (!confirm('Delete this session?')) return
    try { await q(supabase.from('sessions').delete().eq('id', s.session_id)); reload() }
    catch (e) { setErr(e) }
  }

  if (loading && !data) return <Loading />
  const rows = (data?.rows || []).filter((r) => !squad || r.squad_id === squad)

  return (
    <div>
      <div className="row between">
        <h1>Training sessions</h1>
        <div className="row">
          <button onClick={() => setMode('single')}>+ One session</button>
          <button className="primary" onClick={() => setMode('series')}>+ Weekly series</button>
        </div>
      </div>
      <ErrorBox error={error || err} />
      {mode && <SessionForm mode={mode} squads={data.squads} onClose={() => setMode(null)}
        onDone={(n) => { setMode(null); showToast(`${n} session${n === 1 ? '' : 's'} added ✓`); reload() }} />}

      <div className="filters">
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Squad">
          <select value={squad} onChange={(e) => setSquad(e.target.value)}>
            <option value="">All</option>
            {data?.squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Squad</th><th>Venue</th><th>Attended</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.session_id} className={s.cancelled ? 'cancelled' : ''}>
                <td>{fmtDate(s.session_date)} {s.session_date === today && <span className="pill green">Today</span>}</td>
                <td>{fmtTime(s.start_time)}</td>
                <td>{s.squad_name}</td>
                <td>{s.venue}</td>
                <td>{s.cancelled ? <span className="pill red">Cancelled</span>
                  : s.marked ? `${s.present + s.late} / ${s.marked}` : <span className="muted">—</span>}</td>
                <td className="actions">
                  <Link to={`/register/${s.session_id}`}>Register</Link>
                  <button className="link" onClick={() => toggleCancel(s)}>{s.cancelled ? 'Reinstate' : 'Cancel'}</button>
                  <button className="link danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="muted">No sessions in this date range.</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast msg={toast} />
    </div>
  )
}

function SessionForm({ mode, squads, onClose, onDone }) {
  const today = isoDate()
  const [f, setF] = useState({
    squad_id: squads[0]?.id || '', date: today, last_date: addDays(today, 7 * 11),
    start: '10:00', end: '11:30', venue: '', skip: '',
  })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // Preview of dates for a series
  const dates = []
  if (mode === 'series' && f.date && f.last_date) {
    const skip = new Set(f.skip.split(/[\s,]+/).filter(Boolean))
    for (let d = f.date; d <= f.last_date && dates.length < 60; d = addDays(d, 7)) if (!skip.has(d)) dates.push(d)
  }

  async function submit(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (mode === 'single') {
        await q(supabase.from('sessions').insert({
          squad_id: f.squad_id, session_date: f.date, start_time: f.start || null, end_time: f.end || null,
          venue: f.venue || null,
        }))
        onDone(1)
      } else {
        const skip = f.skip.split(/[\s,]+/).filter(Boolean)
        const n = await q(supabase.rpc('create_session_series', {
          p_squad: f.squad_id, p_first_date: f.date, p_last_date: f.last_date,
          p_start: f.start || null, p_end: f.end || null, p_venue: f.venue || null, p_skip: skip,
        }))
        onDone(n)
      }
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="card form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{mode === 'single' ? 'Add one session' : 'Add a weekly series'}</h3>
        <div className="grid2">
          <Field label="Squad">
            <select required value={f.squad_id} onChange={up('squad_id')}>
              {squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Venue"><input value={f.venue} onChange={up('venue')} placeholder="e.g. Main ground" /></Field>
          <Field label={mode === 'single' ? 'Date' : 'First session'}><input type="date" required value={f.date} onChange={up('date')} /></Field>
          {mode === 'series' && <Field label="Last session (or before)"><input type="date" required value={f.last_date} onChange={up('last_date')} /></Field>}
          <Field label="Start"><input type="time" value={f.start} onChange={up('start')} /></Field>
          <Field label="End"><input type="time" value={f.end} onChange={up('end')} /></Field>
        </div>
        {mode === 'series' && (
          <>
            <Field label="Skip these dates" hint="Holidays etc. Format yyyy-mm-dd, separated by commas.">
              <input value={f.skip} onChange={up('skip')} placeholder="2026-12-26, 2027-01-02" />
            </Field>
            <p className="muted small">Same weekday every week: {dates.length} sessions
              {dates.length > 0 && <> — {fmtDate(dates[0])} to {fmtDate(dates[dates.length - 1])}</>}</p>
          </>
        )}
        <ErrorBox error={err} />
        <div className="row">
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
