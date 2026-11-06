import { useEffect, useState, useCallback } from 'react'

// Load data with loading/error state. `load` is an async function.
export function useLoad(load, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setData(await run()) } catch (e) { setError(e) } finally { setLoading(false) }
  }, [run])
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload, setData }
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="error">⚠️ {error.message || String(error)}</div>
}

export function Loading() {
  return <div className="muted pad">Loading…</div>
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null
}

export function useToast() {
  const [msg, setMsg] = useState('')
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  return [msg, show]
}
