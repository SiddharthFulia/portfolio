// Centralized vault state for the whole portfolio.
//
// Single source of truth for "is the user logged into the vault?".
// Replaces the per-component VaultGate modal popups so that:
//   - Logging in/out from the Workshop dropdown updates every page
//     instantly (vault-aware lists hide private items, count badges
//     flip, etc.)
//   - Components subscribe via useVault() instead of each maintaining
//     their own copy of the token state.
//   - Cross-tab logout works: storage events fire when the token is
//     removed in any tab, propagating logout everywhere.
//
// The token itself still lives in localStorage under sid-vault-token
// so api/request.js + every existing fetch helper keep working
// unchanged. We just wrap it with React state + a custom event so
// the same tab gets notified of mutations (storage events only fire
// across tabs, not within the same one).

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY  = "sid-vault-token";
const CHANGE_EVENT = "sid-vault-change";
const BE_URL = import.meta.env.VITE_BE_URL || "http://localhost:4001";

// Module-level singleton so api/request.js (which doesn't sit inside
// a React component tree) can still ask for vault unlock when it
// hits a 401. The Provider registers `requireUnlock` here on mount
// and any module can call requireVaultUnlock() to await an unlock.
let vaultBridge = {
  requireUnlock: () => Promise.resolve(false),
};
export function requireVaultUnlock() {
  return vaultBridge.requireUnlock();
}

const VaultContext = createContext({
  isUnlocked: false,
  token: null,
  login: async () => {},
  logout: () => {},
  loginModalOpen: false,
  openLoginModal: () => {},
  closeLoginModal: () => {},
  // requireUnlock(): returns a Promise<boolean>. Resolves true once the
  // user has unlocked, false if they cancel the modal. Callers use it
  // when they hit a 401 to silently prompt for re-login + retry.
  requireUnlock: async () => false,
});

function readToken() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function VaultProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  // Pending promise resolvers — when requireUnlock() opens the modal,
  // it stores its resolver here; the modal calls it after login (true)
  // or cancel (false), then clears the array.
  const [pendingResolvers, setPendingResolvers] = useState([]);

  // Listen for same-tab changes (custom event) + cross-tab changes
  // (native storage event). Both push the latest token into state.
  useEffect(() => {
    const sync = () => setToken(readToken());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) sync();
    });
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const login = useCallback(async (password) => {
    const res = await fetch(`${BE_URL}/api/auth/vault-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.token) {
      throw new Error(data?.message || "Wrong password");
    }
    try { localStorage.setItem(STORAGE_KEY, data.data.token); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setToken(data.data.token);
    // Resolve everyone waiting on requireUnlock() with true.
    setPendingResolvers((prev) => { prev.forEach((r) => r(true)); return []; });
    return data.data.token;
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setToken(null);
  }, []);

  const openLoginModal  = useCallback(() => setLoginModalOpen(true),  []);
  const closeLoginModal = useCallback(() => {
    setLoginModalOpen(false);
    // If the user dismissed without unlocking, resolve waiters with false.
    setPendingResolvers((prev) => { prev.forEach((r) => r(false)); return []; });
  }, []);

  // Public API for "I need vault NOW" — called by fetch wrappers that
  // just got a 401. If already unlocked: resolves true immediately.
  // Otherwise opens the modal and resolves when the user logs in (true)
  // or cancels (false). Callers retry their request on true, give up
  // on false. NO toast / banner / alert before this — totally silent
  // until the user actually does something that needs the vault.
  const requireUnlock = useCallback(() => {
    if (token) return Promise.resolve(true);
    return new Promise((resolve) => {
      setPendingResolvers((prev) => [...prev, resolve]);
      setLoginModalOpen(true);
    });
  }, [token]);

  // Expose to the module-level bridge so non-React modules
  // (api/request.js, fetch wrappers) can ask for vault unlock too.
  useEffect(() => {
    vaultBridge.requireUnlock = requireUnlock;
    return () => { vaultBridge.requireUnlock = () => Promise.resolve(false); };
  }, [requireUnlock]);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked: !!token,
        token,
        login,
        logout,
        loginModalOpen,
        openLoginModal,
        closeLoginModal,
        requireUnlock,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
