import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, Save, Shield, Trash2, X } from 'lucide-react'

const ADMIN_PERMISSIONS = [
  ['dashboard', 'Dashboard'],
  ['pos', 'POS'],
  ['products', 'Add Product'],
  ['discounts', 'Discounts'],
  ['orders', 'Orders'],
  ['settings', 'Settings'],
  ['messages', 'Customer Messages'],
  ['comments', 'Product Comments']
]

const emptyForm = { username: '', password: '', permissions: [] }

export default function AdminManagement() {
  const [admins, setAdmins] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const loadAdmins = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get('/api/admin-auth/admins')
      setAdmins(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load admin accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAdmins() }, [loadAdmins])

  function startEdit(admin) {
    setEditingId(admin.id)
    setForm({ username: admin.username, password: '', permissions: [...admin.permissions] })
    setStatus('')
    setError('')
  }

  function resetForm() {
    setEditingId('')
    setForm(emptyForm)
    setError('')
    setStatus('')
  }

  function togglePermission(permission) {
    setForm(current => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter(value => value !== permission)
        : [...current.permissions, permission]
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const wasEditing = Boolean(editingId)
      if (wasEditing) {
        const payload = { username: form.username, permissions: form.permissions }
        if (form.password) payload.password = form.password
        await axios.put(`/api/admin-auth/admins/${editingId}`, payload)
      } else {
        await axios.post('/api/admin-auth/admins', form)
      }
      resetForm()
      setStatus(wasEditing ? 'Admin account updated.' : 'Admin account created.')
      await loadAdmins()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save this admin account.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(admin) {
    setError('')
    try {
      await axios.put(`/api/admin-auth/admins/${admin.id}`, { isActive: !admin.isActive })
      await loadAdmins()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update admin status.')
    }
  }

  async function deleteAdmin(admin) {
    if (!window.confirm(`Delete the admin account "${admin.username}"?`)) return
    setError('')
    try {
      await axios.delete(`/api/admin-auth/admins/${admin.id}`)
      if (editingId === admin.id) resetForm()
      await loadAdmins()
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not delete this admin account.')
    }
  }

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 5px', fontSize: '1.25rem' }}>
          <Shield size={20} /> Admin Accounts &amp; Permissions
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Create staff sign-ins and grant access only to the selected dashboard areas. The owner account always retains full access.
        </p>
      </div>

      {error && <p role="alert" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {status && <p role="status" style={{ color: 'var(--color-success, #159957)' }}>{status}</p>}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{editingId ? 'Edit admin access' : 'Add admin'}</h3>
          {editingId && <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm} aria-label="Cancel editing"><X size={16} /></button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label" htmlFor="new-admin-username">Username</label>
            <input
              id="new-admin-username"
              className="form-input"
              value={form.username}
              onChange={event => setForm({ ...form, username: event.target.value })}
              autoComplete="off"
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._-]+"
              required
            />
          </div>
          <div>
            <label className="form-label" htmlFor="new-admin-password">{editingId ? 'New password (optional)' : 'Password'}</label>
            <input
              id="new-admin-password"
              className="form-input"
              type="password"
              value={form.password}
              onChange={event => setForm({ ...form, password: event.target.value })}
              autoComplete="new-password"
              minLength={form.password || !editingId ? 10 : undefined}
              maxLength={128}
              required={!editingId}
            />
            {!editingId && <small style={{ color: 'var(--text-secondary)' }}>At least 10 characters.</small>}
          </div>
        </div>
        <fieldset style={{ border: '1px solid var(--border-default)', borderRadius: 10, margin: '16px 0', padding: 14 }}>
          <legend style={{ padding: '0 6px', fontWeight: 700 }}>Permissions</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px 16px' }}>
            {ADMIN_PERMISSIONS.map(([permission, label]) => (
              <label key={permission} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.permissions.includes(permission)}
                  onChange={() => togglePermission(permission)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : <><Save size={15} /> {editingId ? 'Save changes' : <><Plus size={15} /> Create admin</>}</>}
        </button>
      </form>

      {loading ? <p role="status">Loading admins…</p> : admins.length === 0 ? (
        <p className="card" style={{ padding: 18 }}>No staff admin accounts have been created.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {admins.map(admin => (
            <article className="card" key={admin.id} style={{ padding: 16, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
              <div>
                <strong>{admin.username}</strong>
                <span style={{ marginLeft: 10, color: admin.isActive ? 'var(--color-success, #159957)' : 'var(--color-danger)' }}>
                  {admin.isActive ? 'Active' : 'Disabled'}
                </span>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 5 }}>
                  {admin.permissions.map(permission => ADMIN_PERMISSIONS.find(([key]) => key === permission)?.[1] || permission).join(' · ') || 'No dashboard permissions'}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(admin)}>Edit</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleActive(admin)}>{admin.isActive ? 'Disable' : 'Enable'}</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteAdmin(admin)} aria-label={`Delete ${admin.username}`}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
