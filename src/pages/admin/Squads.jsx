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
      await q(supabase.from('squads').insert({ name: name.trim(), monthly_fee: Number(fee || 0) }))
      setName(''); setFee(''); reload()
    } catch (e2) { setErr(e2) }
  }

  async function save(s) {
    setErr(null)
    try {
      await q(supabase.from('squads').update({ name: s.name, monthly_fee: Number(s.monthly_fee || 0), active: s.active }).eq('id', s.id))
      showToast('Saved ✓')
    } catch (e) { setErr(e) }
  }

  const edit = (id, k, v) => setData(data.map((s) => (s.id === id ? { ...s, [k]: v } : s)))

  if (loading) return <Loading />
  return (
    <div>
      <h1>Squads</h1>
      <p className="muted">Each active player in a squad is charged this amount once a month, when you click
        <b> Raise charges</b> on the Payments tab. A player can have their own amount instead (e.g. a sibling
        discount) — set it on their player page. Changing a fee affects future months only.</p>
      <ErrorBox error={error || err} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Squad</th><th>Monthly fee (£)</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td><input value={s.name} onChange={(e) => edit(s.id, 'name', e.target.value)} /></td>
                <td><input type="number" step="0.01" min="0" value={s.monthly_fee} onChange={(e) => edit(s.id, 'monthly_fee', e.target.value)} /></td>
                <td><input type="checkbox" checked={s.active} onChange={(e) => edit(s.id, 'active', e.target.checked)} /></td>
                <td><button onClick={() => save(s)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card form row" onSubmit={add}>
        <input required placeholder="New squad, e.g. U11" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" step="0.01" min="0" placeholder="Monthly fee £" value={fee} onChange={(e) => setFee(e.target.value)} />
        <button className="primary">Add squad</button>
      </form>
      <Toast msg={toast} />
    </div>
  )
}
