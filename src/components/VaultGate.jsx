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
export function VaultLoginPanel({ label = 'Unlock vault', subtitle, onUnlocked }) {
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
    <div className="relative p-6 sm:p-7 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-gray-900/95 to-gray-950/95 shadow-[0_30px_70px_-20px_rgba(34,211,238,0.35)] overflow-hidden">
      {/* Soft animated halo behind the lock — pure cosmetic */}
      <div aria-hidden className="absolute -top-16 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/15 to-amber-500/15 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="text-center mb-5">
          <div className="relative inline-flex w-14 h-14 items-center justify-center mb-3">
            <span aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 via-fuchsia-400 to-amber-400 opacity-90" />
            <span aria-hidden className="absolute inset-[2px] rounded-full bg-gray-950" />
            <LockOutlined className="relative text-xl bg-gradient-to-br from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
            {label}
          </h2>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed max-w-[34ch] mx-auto">
            {subtitle ?? 'Bypasses the NSFW filter · routes outputs to the private Vault library'}
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
        {error && (
          <p className="text-rose-400 text-xs mt-2 text-center font-medium flex items-center justify-center gap-1">
            <span aria-hidden>✗</span>{error}
          </p>
        )}
        <Button type="primary" size="large" block onClick={submit}
          disabled={!attempt || submitting} loading={submitting}
          className="mt-3 bg-gradient-to-r from-cyan-500 to-fuchsia-500 border-0 hover:opacity-90 font-semibold">
          {submitting ? 'Verifying…' : 'Unlock'}
        </Button>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-gray-600">
          <span aria-hidden className="w-1 h-1 rounded-full bg-gray-700" />
          <span>Stays unlocked on this device for 90 days</span>
          <span aria-hidden className="w-1 h-1 rounded-full bg-gray-700" />
        </div>
      </div>
    </div>
  )
}

// Full-page wrapper — only used if you want to gate a whole page (not us anymore).
export default function VaultGate({ children, label = 'AI Studio', subtitle }) {
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
        <VaultLoginPanel label={label} subtitle={subtitle} onUnlocked={() => setUnlocked(true)} />
      </div>
    </div>
  )
}
