import { useState, useEffect } from 'react'
import { Input, Button } from 'antd'
import { LockOutlined } from '@ant-design/icons'

// Server-side-auth gate. The token is a JWT from /api/auth/vault-login;
// we attach it as Authorization: Bearer on protected requests via
// api/request.js. View/list endpoints stay public — only create/delete
// require the token.
//
// Token survives across browser sessions (localStorage). To revoke all
// sessions, rotate VAULT_JWT_SECRET on the BE.
const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'
const STORAGE_KEY = 'sid-vault-token'

export function getVaultToken() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function setVaultToken(token) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

// The compact login panel — just the card, no full-screen wrapper.
// Use inside an Antd Modal or any container. Calls `onUnlocked()` once the
// JWT is in localStorage. Renders nothing if already unlocked.
export function VaultLoginPanel({ label = 'Unlock vault', onUnlocked }) {
  const [attempt, setAttempt] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!attempt) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${BE_URL}/api/auth/vault-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: attempt }),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.data?.token) {
        setError(data?.message || 'Wrong password')
        setAttempt('')
        return
      }
      setVaultToken(data.data.token)
      onUnlocked?.()
    } catch (e) {
      setError(e.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-5 sm:p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-gray-900/95 to-gray-950/90 shadow-2xl shadow-cyan-500/10">
      <div className="text-center mb-4">
        <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-fuchsia-400 to-amber-400 text-black mb-2">
          <LockOutlined className="text-xl" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
          {label}
        </h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Bypasses the NSFW filter and saves your output to Vault.
        </p>
      </div>
      <Input.Password
        size="large"
        placeholder="Access phrase"
        value={attempt}
        onChange={(e) => { setAttempt(e.target.value); if (error) setError('') }}
        onPressEnter={submit}
        status={error ? 'error' : ''}
        disabled={submitting}
        autoFocus
      />
      {error && <p className="text-rose-400 text-xs mt-2 text-center">{error}</p>}
      <Button type="primary" size="large" block onClick={submit}
        disabled={!attempt || submitting} loading={submitting}
        className="mt-3 bg-gradient-to-r from-cyan-500 to-fuchsia-500 border-0 hover:opacity-90 font-semibold">
        Unlock
      </Button>
      <p className="text-[10px] text-gray-600 mt-3 text-center">
        Stays logged in on this device for 90 days
      </p>
    </div>
  )
}

// Full-page wrapper — only used if you want to gate a whole page (not us anymore).
export default function VaultGate({ children, label = 'AI Studio' }) {
  const [unlocked, setUnlocked] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = getVaultToken()
    if (!token) { setChecking(false); return }
    fetch(`${BE_URL}/api/auth/vault-status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    })
      .then(r => { setUnlocked(r.ok); if (!r.ok) setVaultToken(null) })
      .catch(() => setUnlocked(false))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
      </div>
    )
  }
  if (unlocked) return children
  return (
    <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <VaultLoginPanel label={label} onUnlocked={() => setUnlocked(true)} />
      </div>
    </div>
  )
}
