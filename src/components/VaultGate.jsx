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

export default function VaultGate({ children, label = 'AI Studio' }) {
  const [unlocked, setUnlocked] = useState(false)
  const [attempt, setAttempt] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  // On mount, validate any existing token with the BE so a rotated secret
  // boots the user back to the login screen.
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
      setUnlocked(true)
    } catch (e) {
      setError(e.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-gray-900/80 to-gray-950/60 shadow-2xl shadow-cyan-500/10">
        <div className="text-center mb-5">
          <div className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-fuchsia-400 to-amber-400 text-black mb-3">
            <LockOutlined className="text-2xl" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
            {label}
          </h2>
          <p className="text-xs text-gray-500 mt-1.5">
            Private space — enter the access phrase to continue
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
          <p className="text-rose-400 text-xs mt-2 text-center">{error}</p>
        )}
        <Button type="primary" size="large" block onClick={submit}
          disabled={!attempt || submitting} loading={submitting}
          className="mt-4 bg-gradient-to-r from-cyan-500 to-fuchsia-500 border-0 hover:opacity-90 font-semibold">
          Unlock
        </Button>
        <p className="text-[10px] text-gray-600 mt-4 text-center">
          Server-authenticated · stays logged in on this device
        </p>
      </div>
    </div>
  )
}
