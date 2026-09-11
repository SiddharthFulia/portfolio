// Sandboxed code execution client — powers the "Run" button on the
// /algorithms/* pages. The BE hides the upstream sandbox URL and
// enforces limits (5s runtime, 15s compile, 256MB memory, 20KB source,
// 10 runs / IP / minute) plus a 15-min result cache.
//
// Response envelope (from BE):
//   {
//     ok, stdout, stderr, exit_code, compile_output,
//     runtime_ms, cached, language, version, limits
//   }
//
// The 30-second FE timeout is a hard upper bound — the BE will have
// already aborted at 25s and returned a friendly stderr message.

import { post } from './request';
import { ENDPOINTS } from './endpoints';

export async function runCode({ language, code, stdin = '', signal } = {}) {
  try {
    // When an AbortSignal is passed (auto-run cancels in-flight requests
    // on rapid keystrokes), we let it override the 30s timeout — the
    // caller owns the lifecycle.
    const opts = signal ? { signal } : { timeout: 30_000 };
    const data = await post(
      ENDPOINTS.CODE_RUN,
      { language, code, stdin },
      opts
    );
    // `post` returns the raw envelope { status, message, data }; the
    // useful payload lives under .data.
    return { data: data?.data || data, error: null };
  } catch (err) {
    // Aborted requests surface as DOMException('AbortError') — swallow
    // them silently so auto-run's rapid-fire cancellations don't spam
    // the stderr panel.
    if (err?.name === 'AbortError') return { data: null, error: null, aborted: true };
    // Rate limits (429) + size caps (413) + pseudo-code (400) reach us
    // as thrown errors. Surface a clean message; the FE renders it as
    // the stderr panel body so users never see "Request failed: 429".
    return { data: null, error: err?.message || 'Run failed' };
  }
}
