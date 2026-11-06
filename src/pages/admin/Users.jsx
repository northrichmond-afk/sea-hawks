import { useEffect, useState } from 'react'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Field, Toast, useToast } from '../../components.jsx'
import { useMe } from '../../App.jsx'

export default function Users() {
  const me = useMe()
  const [form, setForm] = useState({ email: '', full_name: '', role: 'coach' })
  const [err, setErr] = useState(null)
  const [toast, showToast] = useToast()
  const { data, error, loading, reload } = useLoad(async () => {
    const [users, settings] = await Promise.all([
      q(supabase.from('app_users').select('*').order('role').order('email')),
      q(supabase.from('club_settings').select('*').single()),
    ])
    return { users, settings }
  })

  async function invite(e) {
    e.preventDefault()
    setErr(null)
    try {
      await q(supabase.from('app_users').insert({ ...form, email: form.email.trim().toLowerCase() }))
      setForm({ email: '', full_name: '', role: 'coach' })
      showToast('Added — they can now sign in with Google ✓')
      reload()
    } catch (e2) { setErr(e2) }
  }

  async function update(u, patch) {
    if (u.email === me.email && (patch.active === false || patch.role === 'coach')) {
      if (!confirm('This will remove your own admin access. Continue?')) return
    }
    setErr(null)
    try { await q(supabase.from('app_users').update(patch).eq('id', u.id)); reload() } catch (e) { setErr(e) }
  }

  async function remove(u) {
    if (u.email === me.email) { alert("You can't remove yourself."); return }
    if (!confirm(`Remove ${u.email}?`)) return
    try { await q(supabase.from('app_users').delete().eq('id', u.id)); reload() } catch (e) { setErr(e) }
  }

  if (loading) return <Loading />
  return (
    <div>
      <h1>Settings</h1>
      <h2>Staff access</h2>
      <p className="muted">Admins and coaches sign in with the Google account for the email listed here.
        <b> Parents don't need adding here</b> — they get access automatically when their email is on a guardian record.</p>
      <ErrorBox error={error || err} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'cancelled'}>
                <td>{u.email}</td>
                <td>{u.full_name}</td>
                <td>
                  <select value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td><input type="checkbox" checked={u.active} onChange={(e) => update(u, { active: e.target.checked })} /></td>
                <td><button className="link danger" onClick={() => remove(u)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card form row" onSubmit={invite}>
        <input type="email" required placeholder="Google email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
        <button className="primary">Add</button>
      </form>

      <ClubSettings settings={data.settings} onSaved={() => showToast('Club details saved ✓')} />
      <Toast msg={toast} />
    </div>
  )
}

function ClubSettings({ settings, onSaved }) {
  const [s, setS] = useState(settings)
  const [err, setErr] = useState(null)
  useEffect(() => setS(settings), [settings])
  const up = (k) => (e) => setS({ ...s, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    setErr(null)
    try {
      const { id, ...patch } = s
      await q(supabase.from('club_settings').update(patch).eq('id', true))
      onSaved()
    } catch (e2) { setErr(e2) }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h2>Club bank details</h2>
      <p className="muted small">Shown to parents on their “How to pay” box.</p>
      <div className="grid2">
        <Field label="Club name"><input value={s.club_name || ''} onChange={up('club_name')} /></Field>
        <Field label="Account name"><input value={s.bank_account_name || ''} onChange={up('bank_account_name')} /></Field>
        <Field label="Sort code"><input value={s.bank_sort_code || ''} onChange={up('bank_sort_code')} /></Field>
        <Field label="Account number"><input value={s.bank_account_no || ''} onChange={up('bank_account_no')} /></Field>
      </div>
      <Field label="Payment note"><input value={s.payment_note || ''} onChange={up('payment_note')} /></Field>
      <ErrorBox error={err} />
      <button className="primary">Save club details</button>
    </form>
  )
}
