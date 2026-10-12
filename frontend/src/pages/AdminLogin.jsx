import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { clearAdminSession, getAdminToken, saveAdminSession } from '../utils/adminAuth'

export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [needsSetup, setNeedsSetup] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const hasSession = Boolean(getAdminToken())

  useEffect(() => {
    let active = true
    axios.get('/api/admin-auth/setup-status')
      .then(response => {
        if (active) setNeedsSetup(Boolean(response.data?.needsSetup))
      })
      .catch(requestError => {
        if (active) setError(requestError.response?.data?.error || 'Could not check admin setup status.')
      })
      .finally(() => {
        if (active) setCheckingSetup(false)
      })
    return () => { active = false }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const endpoint = needsSetup ? '/api/admin-auth/setup' : '/api/admin-auth/login'
      const response = await axios.post(endpoint, { username, password })
      saveAdminSession(response.data.token, response.data.admin)
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Admin sign-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page-wrapper" style={{ minHeight: '75vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section className="card" style={{ width: 'min(100%, 460px)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ShieldCheck size={28} color="var(--color-primary)" />
          <h1 className="page-title" style={{ margin: 0 }}>{needsSetup ? 'Set up owner account' : 'Admin sign in'}</h1>
        </div>
        <p className="page-subtitle" style={{ marginBottom: 22 }}>
          {location.state?.noPermissions
            ? 'No dashboard sections are assigned to this account. Ask the owner to grant access.'
            : needsSetup
            ? 'Create the first owner account. This account can add admins and manage all permissions.'
            : 'Sign in with your admin username and password to open the dashboard.'}
        </p>
        {location.state?.noPermissions && hasSession ? (
          <button type="button" className="btn btn-secondary" onClick={() => {
            clearAdminSession()
            navigate('/admin-login', { replace: true, state: null })
          }}>Sign out</button>
        ) : checkingSetup ? <p role="status">Checking admin setup…</p> : (
          <form onSubmit={handleSubmit}>
            <label className="form-label" htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              className="form-input"
              autoComplete="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={32}
            />
            <label className="form-label" htmlFor="admin-password" style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
              <LockKeyhole size={14} /> Password
            </label>
            <input
              id="admin-password"
              className="form-input"
              type="password"
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              minLength={needsSetup ? 10 : undefined}
              maxLength={128}
            />
            {needsSetup && <small style={{ display: 'block', color: 'var(--text-secondary)', marginTop: 6 }}>Use at least 10 characters for the owner password.</small>}
            {error && <p role="alert" style={{ color: 'var(--color-danger)', margin: '14px 0 0' }}>{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}>
              {submitting ? 'Please wait…' : needsSetup ? 'Create owner account' : 'Sign in'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
