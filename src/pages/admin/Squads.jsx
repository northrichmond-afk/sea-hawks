import { useState } from 'react'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Toast, useToast } from '../../components.jsx'

export default function Squads() {
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  const [err, setErr] = useState(null)
  const [toast, showToast] = useToast()
  const { data, error, loading, reload, setData } = useLoad(() =>
    q(supabase.from('squads').select('*').order('name')))

  async function add(e) {
    e.preventDefault()
    setErr(null)
    try {
      await q(supabase.from('squads').insert({ name: name.trim(), default_fee: Number(fee || 0) }))
      setName(''); setFee(''); reload()
    } catch (e2) { setErr(e2) }
  }

  async function save(s) {
    setErr(null)
    try {
      await q(supabase.from('squads').update({ name: s.name, default_fee: Number(s.default_fee || 0), active: s.active }).eq('id', s.id))
      showToast('Saved ✓')
    } catch (e) { setErr(e) }
  }

  const edit = (id, k, v) => setData(data.map((s) => (s.id === id ? { ...s, [k]: v } : s)))

  if (loading) return <Loading />
  return (
    <div>
      <h1>Squads</h1>
      <p className="muted">The fee is the default charge per session attended. You can override it on any session.
        Changing it here only affects sessions created afterwards.</p>
      <ErrorBox error={error || err} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Squad</th><th>Fee / session (£)</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td><input value={s.name} onChange={(e) => edit(s.id, 'name', e.target.value)} /></td>
                <td><input type="number" step="0.01" min="0" value={s.default_fee} onChange={(e) => edit(s.id, 'default_fee', e.target.value)} /></td>
                <td><input type="checkbox" checked={s.active} onChange={(e) => edit(s.id, 'active', e.target.checked)} /></td>
                <td><button onClick={() => save(s)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card form row" onSubmit={add}>
        <input required placeholder="New squad, e.g. U11" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" step="0.01" min="0" placeholder="Fee £" value={fee} onChange={(e) => setFee(e.target.value)} />
        <button className="primary">Add squad</button>
      </form>
      <Toast msg={toast} />
    </div>
  )
}
