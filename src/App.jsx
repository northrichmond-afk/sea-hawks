import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { configured, supabase } from './supabase.js'
import { Login, SetNewPassword } from './pages/Login.jsx'

import Today from './pages/coach/Today.jsx'
import Register from './pages/coach/Register.jsx'
import Players from './pages/admin/Players.jsx'
import PlayerEdit from './pages/admin/PlayerEdit.jsx'
import Squads from './pages/admin/Squads.jsx'
import Sessions from './pages/admin/Sessions.jsx'
import Payments from './pages/admin/Payments.jsx'
import Reports from './pages/admin/Reports.jsx'
import Users from './pages/admin/Users.jsx'
import MyChildren from './pages/parent/MyChildren.jsx'

const MeContext = createContext(null)
export const useMe = () => useContext(MeContext)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState(null)
  const [recovering, setRecovering] = useState(false) // arrived from a reset-password email
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!configured) return
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    const errDesc = params.get('error_description')
    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname + window.location.hash)

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })

    ;(async () => {
      if (tokenHash && type) {
        // Links from the customised Supabase email templates (work on any device)
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        cleanUrl()
        if (error) setNotice('That link has expired or was already used. Please sign in, or request a new link.')
        else if (type === 'recovery') setRecovering(true)
      } else if (errDesc) {
        cleanUrl()
        setNotice(errDesc.includes('expired') ? 'That link has expired. Please request a new one.' : errDesc)
      }
      const { data, error } = await supabase.auth.getSession()
      // A default (non-customised) link opened in a different browser can't finish
      // signing in, but the email is still confirmed — so just ask them to sign in.
      if (error && window.location.search.includes('code=')) {
        cleanUrl()
        setNotice('Your email is confirmed. Please sign in.')
      }
      setSession(data?.session ?? null)
    })()

    return () => sub.subscription.unsubscribe()
  }, [])

  // Remove ?code=... from the address bar after sign-in
  useEffect(() => {
    if (session && window.location.search.includes('code=')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [session])

  useEffect(() => {
    if (!session) { setMe(null); return }
    supabase.rpc('whoami').then(({ data, error }) => {
      if (error) setMeError(error)
      else setMe(data)
    })
  }, [session])

  if (!configured) return <NotConfigured />
  if (session === undefined) return <div className="center muted">Loading…</div>
  if (!session) return <Login notice={notice} />
  if (recovering) return <SetNewPassword onDone={() => { setRecovering(false); setNotice(null) }} />
  if (meError) return <div className="center error">Could not load your account: {meError.message}</div>
  if (!me) return <div className="center muted">Loading…</div>

  const isAdmin = me.role === 'admin'
  const isStaff = me.role === 'admin' || me.role === 'coach'
  const isParent = me.is_parent

  if (!isStaff && !isParent) return <NoAccess email={me.email} />

  const home = isAdmin ? '/payments' : isStaff ? '/today' : '/my'

  return (
    <MeContext.Provider value={{ ...me, isAdmin, isStaff, isParent }}>
      <header className="topbar">
        <div className="brand">🏏 Sea Hawks</div>
        <nav>
          {isStaff && <NavLink to="/today">Registers</NavLink>}
          {isAdmin && <NavLink to="/sessions">Sessions</NavLink>}
          {isAdmin && <NavLink to="/players">Players</NavLink>}
          {isAdmin && <NavLink to="/payments">Payments</NavLink>}
          {isAdmin && <NavLink to="/reports">Reports</NavLink>}
          {isAdmin && <NavLink to="/squads">Squads</NavLink>}
          {isAdmin && <NavLink to="/users">Settings</NavLink>}
          {isParent && <NavLink to="/my">My children</NavLink>}
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()} title={me.email}>Sign out</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          {isStaff && <Route path="/today" element={<Today />} />}
          {isStaff && <Route path="/register/:id" element={<Register />} />}
          {isAdmin && <Route path="/sessions" element={<Sessions />} />}
          {isAdmin && <Route path="/players" element={<Players />} />}
          {isAdmin && <Route path="/players/:id" element={<PlayerEdit />} />}
          {isAdmin && <Route path="/payments" element={<Payments />} />}
          {isAdmin && <Route path="/reports" element={<Reports />} />}
          {isAdmin && <Route path="/squads" element={<Squads />} />}
          {isAdmin && <Route path="/users" element={<Users />} />}
          {isParent && <Route path="/my" element={<MyChildren />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </MeContext.Provider>
  )
}

function NoAccess({ email }) {
  return (
    <div className="center">
      <div className="card login">
        <h2>No access yet</h2>
        <p>You're signed in as <b>{email || 'an unconfirmed email'}</b>, but this email isn't set up with the club.</p>
        <p className="muted">Parents: ask the club admin to add this exact email address to your child's record,
          then sign in again. Coaches: ask the admin to invite you.</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="center">
      <div className="card login">
        <h2>Setup needed</h2>
        <p>Supabase connection details are missing. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (see README).</p>
      </div>
    </div>
  )
}
