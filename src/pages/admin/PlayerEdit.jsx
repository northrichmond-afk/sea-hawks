import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, q } from '../../supabase.js'
import { useLoad, ErrorBox, Loading, Field, Toast, useToast } from '../../components.jsx'
import { money } from '../../lib/format.js'
import PlayerHistory from './PlayerHistory.jsx'

const EMPTY_PLAYER = { first_name: '', last_name: '', dob: '', squad_id: '', status: 'active', notes: '', fee_override: '' }
const EMPTY_GUARDIAN = {
  full_name: '', email: '', phone: '', address_line1: '', address_line2: '', town: '', postcode: '',
  consent: false, relationship: 'Parent',
}

export default function PlayerEdit() {
  const { id } = useParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const [player, setPlayer] = useState(EMPTY_PLAYER)
  const [saveError, setSaveError] = useState(null)
  const [toast, showToast] = useToast()
  const [history, setHistory] = useState(false)

  const { data, error, loading, reload } = useLoad(async () => {
    const squads = await q(supabase.from('squads').select('id, name, monthly_fee').eq('active', true).order('name'))
    if (isNew) return { squads, player: null, links: [], balance: null }
    const [player, links, balance] = await Promise.all([
      q(supabase.from('players').select('*').eq('id', id).single()),
      q(supabase.from('player_guardians').select('relationship, guardians(*)').eq('player_id', id)),
      q(supabase.from('player_balances').select('*').eq('player_id', id).maybeSingle()),
    ])
    return { squads, player, links, balance }
  }, [id])

  useEffect(() => {
    if (data?.player) setPlayer({ ...EMPTY_PLAYER, ...data.player, dob: data.player.dob || '', notes: data.player.notes || '', fee_override: data.player.fee_override ?? '' })
    else if (isNew) setPlayer(EMPTY_PLAYER)
  }, [data, isNew])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const up = (k) => (e) => setPlayer({ ...player, [k]: e.target.value })

  async function savePlayer(e) {
    e.preventDefault()
    setSaveError(null)
    const row = {
      first_name: player.first_name.trim(), last_name: player.last_name.trim(),
      dob: player.dob || null, squad_id: player.squad_id || null,
      status: player.status, notes: player.notes || null,
      fee_override: player.fee_override === '' || player.fee_override === null ? null : Number(player.fee_override),
    }
    try {
      if (isNew) {
        const created = await q(supabase.from('players').insert(row).select().single())
        nav(`/players/${created.id}`, { replace: true })
        showToast('Player added — now add a parent/guardian below')
      } else {
        await q(supabase.from('players').update(row).eq('id', id))
        showToast('Saved ✓')
        reload()
      }
    } catch (err) { setSaveError(err) }
  }

  return (
    <div>
      <Link to="/players" className="muted">← Players</Link>
      <h1>{isNew ? 'Add player' : `${data.player.first_name} ${data.player.last_name}`}</h1>
      {!isNew && (
        <p>Payment reference <code>{data.player.payment_ref}</code>
          {data.balance && <> · Balance <b className={data.balance.balance > 0 ? 'owing' : ''}>{money(data.balance.balance)}</b></>}
          {' '}<button className="link" onClick={() => setHistory(true)}>View history</button>
        </p>
      )}

      <form className="card form" onSubmit={savePlayer}>
        <div className="grid2">
          <Field label="First name"><input required value={player.first_name} onChange={up('first_name')} /></Field>
          <Field label="Last name"><input required value={player.last_name} onChange={up('last_name')} /></Field>
          <Field label="Date of birth"><input type="date" value={player.dob} onChange={up('dob')} /></Field>
          <Field label="Squad">
            <select value={player.squad_id || ''} onChange={up('squad_id')}>
              <option value="">— choose —</option>
              {data.squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Monthly fee override £"
            hint={`Leave blank to use the squad fee (${money(data.squads.find((s) => s.id === player.squad_id)?.monthly_fee)})`}>
            <input type="number" step="0.01" min="0" value={player.fee_override} onChange={up('fee_override')} />
          </Field>
          <Field label="Status">
            <select value={player.status} onChange={up('status')}>
              <option value="active">Active</option>
              <option value="left">Left the club</option>
            </select>
          </Field>
        </div>
        <Field label="Notes" hint="Avoid medical details here.">
          <textarea rows="2" value={player.notes} onChange={up('notes')} />
        </Field>
        <ErrorBox error={saveError} />
        <button className="primary" type="submit">{isNew ? 'Add player' : 'Save player'}</button>
      </form>

      {history && <PlayerHistory player={data.player} onClose={() => { setHistory(false); reload() }} />}
      {!isNew && <Guardians playerId={id} links={data.links} onChange={reload} showToast={showToast} />}
      <Toast msg={toast} />
    </div>
  )
}

function Guardians({ playerId, links, onChange, showToast }) {
  const [editing, setEditing] = useState(null) // guardian object or 'new'
  const [linkSearch, setLinkSearch] = useState('')
  const [matches, setMatches] = useState([])
  const [err, setErr] = useState(null)

  async function findExisting(term) {
    setLinkSearch(term)
    if (term.trim().length < 2) { setMatches([]); return }
    const t = `*${term.trim().replace(/[,()*%]/g, ' ')}*`
    const rows = await q(supabase.from('guardians').select('id, full_name, email, postcode')
      .or(`full_name.ilike.${t},email.ilike.${t}`).limit(8))
    setMatches(rows.filter((r) => !links.some((l) => l.guardians.id === r.id)))
  }

  async function linkExisting(g) {
    setErr(null)
    try {
      await q(supabase.from('player_guardians').insert({ player_id: playerId, guardian_id: g.id, relationship: 'Parent' }))
      setLinkSearch(''); setMatches([])
      showToast(`Linked ${g.full_name}`)
      onChange()
    } catch (e) { setErr(e) }
  }

  async function unlink(gid) {
    if (!confirm('Remove this guardian from this player? (Their record is kept for siblings.)')) return
    await q(supabase.from('player_guardians').delete().eq('player_id', playerId).eq('guardian_id', gid))
    onChange()
  }

  return (
    <section>
      <div className="row between">
        <h2>Parents / guardians</h2>
        <button onClick={() => setEditing('new')}>+ New guardian</button>
      </div>
      <p className="muted small">The guardian's email is what they sign in with (Google). Siblings: link the same guardian to each child.</p>
      <ErrorBox error={err} />
      <div className="cards">
        {links.map(({ guardians: g, relationship }) => (
          <div key={g.id} className="card">
            <div className="row between"><b>{g.full_name}</b><span className="muted">{relationship}</span></div>
            <div>{g.email || <span className="pill red">No email – can't sign in</span>}</div>
            <div>{g.phone}</div>
            <div className="muted">{[g.address_line1, g.address_line2, g.town, g.postcode].filter(Boolean).join(', ')}</div>
            <div className="muted small">{g.consent_given_at ? `Consent recorded ${new Date(g.consent_given_at).toLocaleDateString('en-GB')}` : '⚠️ No consent recorded'}</div>
            <div className="row">
              <button className="link" onClick={() => setEditing({ ...g, relationship })}>Edit</button>
              <button className="link danger" onClick={() => unlink(g.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <Field label="Link an existing guardian (e.g. a sibling's parent)">
          <input placeholder="Type a name or email…" value={linkSearch} onChange={(e) => findExisting(e.target.value)} />
        </Field>
        {matches.map((m) => (
          <div key={m.id} className="row between">
            <span>{m.full_name} <span className="muted">{m.email} {m.postcode}</span></span>
            <button onClick={() => linkExisting(m)}>Link</button>
          </div>
        ))}
      </div>

      {editing && (
        <GuardianForm playerId={playerId} guardian={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); showToast('Guardian saved ✓'); onChange() }} />
      )}
    </section>
  )
}

function GuardianForm({ playerId, guardian, onClose, onSaved }) {
  const [g, setG] = useState(guardian
    ? { ...EMPTY_GUARDIAN, ...Object.fromEntries(Object.entries(guardian).map(([k, v]) => [k, v ?? ''])), consent: !!guardian.consent_given_at }
    : EMPTY_GUARDIAN)
  const [err, setErr] = useState(null)
  const up = (k) => (e) => setG({ ...g, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    setErr(null)
    const row = {
      full_name: g.full_name.trim(), email: g.email.trim().toLowerCase() || null, phone: g.phone || null,
      address_line1: g.address_line1 || null, address_line2: g.address_line2 || null,
      town: g.town || null, postcode: g.postcode.toUpperCase() || null,
      consent_given_at: g.consent ? (guardian?.consent_given_at || new Date().toISOString()) : null,
    }
    try {
      if (guardian) {
        await q(supabase.from('guardians').update(row).eq('id', guardian.id))
        await q(supabase.from('player_guardians').update({ relationship: g.relationship })
          .eq('player_id', playerId).eq('guardian_id', guardian.id))
      } else {
        const created = await q(supabase.from('guardians').insert(row).select().single())
        await q(supabase.from('player_guardians').insert({ player_id: playerId, guardian_id: created.id, relationship: g.relationship }))
      }
      onSaved()
    } catch (e2) { setErr(e2) }
  }

  return (
    <div className="modal" onClick={onClose}>
      <form className="card form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>{guardian ? 'Edit guardian' : 'New guardian'}</h3>
        <div className="grid2">
          <Field label="Full name"><input required value={g.full_name} onChange={up('full_name')} /></Field>
          <Field label="Relationship"><input value={g.relationship} onChange={up('relationship')} /></Field>
          <Field label="Email (Google account)"><input type="email" value={g.email} onChange={up('email')} /></Field>
          <Field label="Phone"><input value={g.phone} onChange={up('phone')} /></Field>
          <Field label="Address line 1"><input value={g.address_line1} onChange={up('address_line1')} /></Field>
          <Field label="Address line 2"><input value={g.address_line2} onChange={up('address_line2')} /></Field>
          <Field label="Town"><input value={g.town} onChange={up('town')} /></Field>
          <Field label="Postcode"><input value={g.postcode} onChange={up('postcode')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={g.consent} onChange={up('consent')} />
          Parent/guardian has consented to the club storing these details</label>
        <ErrorBox error={err} />
        <div className="row">
          <button className="primary" type="submit">Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

