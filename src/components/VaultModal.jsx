// Globally-mounted Vault login dialog. Opened by useVault().openLoginModal()
// from anywhere in the app — typically the Workshop dropdown entry.
// On success the centralized vault state flips and every subscriber
// (libraries, count badges, vault-gated pages) refreshes automatically.

import { useState } from "react";
import { Modal, Input } from "antd";
import { LockOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import { useVault } from "../contexts/VaultContext";

export default function VaultModal() {
  const { loginModalOpen, closeLoginModal, login } = useVault();
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [err, setErr]               = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPassword("");
    setErr("");
    setSubmitting(false);
  };

  const submit = async () => {
    if (!password || submitting) return;
    setErr("");
    setSubmitting(true);
    try {
      await login(password);
      reset();
      closeLoginModal();
    } catch (e) {
      setErr(e.message || "Wrong password");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={loginModalOpen}
      onCancel={() => { reset(); closeLoginModal(); }}
      footer={null}
      centered
      width={420}
      destroyOnClose
      maskClosable={!submitting}
    >
      <div className="text-center pt-3 pb-1">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/40 text-fuchsia-300 text-xl mb-3">
          <LockOutlined />
        </div>
        <h3 className="text-lg font-semibold text-white">Unlock the Vault</h3>
        <p className="mt-1 text-xs text-gray-400">
          Required for create / edit / delete actions across the site.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <Input.Password
          autoFocus
          size="large"
          placeholder="Vault password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={submit}
          iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
          status={err ? "error" : ""}
          visibilityToggle={{ visible: showPw, onVisibleChange: setShowPw }}
        />
        {err && <p className="text-xs text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={!password || submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-fuchsia-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm hover:bg-fuchsia-400 transition-colors"
        >
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
        <p className="text-[10px] text-gray-500 text-center pt-1">
          Token survives across sessions until you log out.
        </p>
      </div>
    </Modal>
  );
}
