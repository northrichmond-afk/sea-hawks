import { useState } from 'react'
import {
  signInWithGoogle, signInWithPassword, signUpWithPassword, sendPasswordReset,
  setNewPassword, friendlyAuthError, supabase,
} from '../supabase.js'

const MIN_LENGTH = 8

function checkPassword(pw, confirm) {
  if (pw.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include letters and numbers.'
  if (pw !== confirm) return "The two passwords don't match."
  return null
}

// Sign-in page: Google, or email + password (sign in / create account / forgot password)
export function Login({ notice }) {
  const [mode, setMode] = useState('signin') // signin | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(notice || null)

  const go = (m) => { setMode(m); setError(null); setInfo(null); setPassword(''); setConfirm('') }

  async function submit(e) {
    e.preventDefault()
    setError(null); setInfo(null)
    if (mode === 'signup') {
      const problem = checkPassword(password, confirm)
      if (problem) { setError(problem); return }
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await signInWithPassword(email, password)
        if (err) throw err
      } else if (mode === 'signup') {
        const { data, error: err } = await signUpWithPassword(email, password)
        if (err) throw err
        // Supabase returns a user with no identities if the email is already registered
        if (data?.user && data.user.identities?.length === 0) {
          setError('An account with this email already exists. Sign in, or use “Forgot password”.')
        } else {
          setInfo(`Nearly done! We've sent a confirmation link to ${email.trim()}. Click it, then sign in here. (Check spam if it doesn't arrive in a few minutes.)`)
          setMode('signin'); setPassword(''); setConfirm('')
        }
      } else {
        const { error: err } = await sendPasswordReset(email)
        if (err) throw err
        // Same message whether or not the account exists, so nobody can probe for emails
        setInfo(`If an account exists for ${email.trim()}, we've emailed a link to reset the password.`)
      }
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const titles = { signin: 'Sign in', signup: 'Create an account', forgot: 'Reset your password' }

  return (
    <div className="center">
      <div className="card login">
        <h1>🏏 Sea Hawks Cricket</h1>
        <p className="muted">Coaching registers, payments and attendance.</p>

        {mode !== 'forgot' && (
          <>
            <button className="google big" type="button" onClick={async () => {
              const { error: err } = await signInWithGoogle()
              if (err) setError(friendlyAuthError(err))
            }}>
              <GoogleIcon /> Continue with Google
            </button>
            <div className="divider"><span>or use email</span></div>
          </>
        )}

        <h2 className="login-title">{titles[mode]}</h2>
        {mode === 'forgot' && <p className="muted small">Enter your email and we'll send you a link to choose a new password.</p>}

        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span>Password</span>
              <input type={showPw ? 'text' : 'password'} required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {mode === 'signup' && (
            <label className="field">
              <span>Confirm password</span>
              <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <small className="muted">At least {MIN_LENGTH} characters, with letters and numbers.</small>
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="check small"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show password</label>
          )}

          {error && <div className="error">{error}</div>}
          {info && <div className="info">{info}</div>}

          <button className="primary big" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'signin' && <>
            <button className="link" onClick={() => go('forgot')}>Forgot password?</button>
            <button className="link" onClick={() => go('signup')}>New here? Create an account</button>
          </>}
          {mode !== 'signin' && <button className="link" onClick={() => go('signin')}>← Back to sign in</button>}
        </div>

        {mode === 'signup' && (
          <p className="muted small">Use the same email address you gave the club, so we can link you to your child.</p>
        )}
      </div>
    </div>
  )
}

// Shown after someone clicks the reset link in their email
export function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const problem = checkPassword(password, confirm)
    if (problem) { setError(problem); return }
    setBusy(true); setError(null)
    const { error: err } = await setNewPassword(password)
    setBusy(false)
    if (err) setError(friendlyAuthError(err))
    else onDone()
  }

  return (
    <div className="center">
      <div className="card login">
        <h1>🏏 Sea Hawks Cricket</h1>
        <h2 className="login-title">Choose a new password</h2>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>New password</span>
            <input type={showPw ? 'text' : 'password'} required autoComplete="new-password" autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <small className="muted">At least {MIN_LENGTH} characters, with letters and numbers.</small>
          </label>
          <label className="check small"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show password</label>
          {error && <div className="error">{error}</div>}
          <button className="primary big" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
        <div className="login-links">
          <button className="link" onClick={() => supabase.auth.signOut()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
