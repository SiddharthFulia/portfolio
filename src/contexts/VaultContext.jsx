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

const VaultContext = createContext({
  isUnlocked: false,
  token: null,
  login: async () => {},
  logout: () => {},
  loginModalOpen: false,
  openLoginModal: () => {},
  closeLoginModal: () => {},
});

function readToken() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function VaultProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

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
    return data.data.token;
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setToken(null);
  }, []);

  const openLoginModal  = useCallback(() => setLoginModalOpen(true),  []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);

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
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
