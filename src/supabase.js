import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)

// PKCE flow returns ?code=... in the query string, which doesn't clash
// with the #/hash routes used for GitHub Pages.
export const supabase = configured
  ? createClient(url, key, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    })
  : null

// Where emails and Google send people back to (the site's home page)
export const siteUrl = () => window.location.origin + window.location.pathname

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } })
}

export function signInWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
}

export function signUpWithPassword(email, password) {
  return supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: siteUrl() },
  })
}

export function sendPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: siteUrl() })
}

export function setNewPassword(password) {
  return supabase.auth.updateUser({ password })
}

// Turn Supabase auth errors into plain English
export function friendlyAuthError(error) {
  const m = (error?.message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the link we sent.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in, or use “Forgot password”.'
  if (m.includes('password should be') || m.includes('weak')) return 'Please choose a stronger password (at least 8 characters, mixing letters and numbers).'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (m.includes('same password') || m.includes('different from the old')) return 'Your new password must be different from your old one.'
  return error?.message || 'Something went wrong. Please try again.'
}

// Throw on Supabase errors so pages can show them
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}
