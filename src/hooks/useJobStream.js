// useJobStream — subscribe to a BE job's live events via SSE.
//
// Drop-in replacement for the setInterval-based polling pattern you'll find
// in Cinema.jsx / RoomDesign.jsx / AIVideo.jsx / MeshLibrary.jsx etc.
//
// Usage:
//   const { status, event, ready, error } = useJobStream(jobId, {
//     onEvent: (type, data) => { ... },   // optional per-event callback
//     enabled: true,                        // pass false to pause the stream
//   });
//
// Contract:
//   · One EventSource per jobId; auto-cleanup on unmount / jobId change.
//   · The BE fires ONE event per state change (`progress` | `complete` |
//     `failed` | `requeued`), plus a `hello` handshake on open.
//   · When the stream drops, EventSource auto-reconnects with backoff.
//   · If the browser lacks EventSource (very old, or a strict env),
//     `error` returns 'unsupported' — callers can then fall back to the
//     legacy poll path themselves.

import { useEffect, useRef, useState } from 'react';

const BE = import.meta.env.VITE_BE_URL || '';

export function useJobStream(jobId, { onEvent, enabled = true } = {}) {
  const [status, setStatus]   = useState(null);
  const [event, setEvent]     = useState(null);    // { type, data, at }
  const [ready, setReady]     = useState(false);
  const [error, setError]     = useState(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !jobId) {
      setReady(false);
      return undefined;
    }
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      setError('unsupported');
      return undefined;
    }

    const url = `${BE}/api/events/job/${encodeURIComponent(jobId)}`;
    const es = new EventSource(url);

    const push = (type) => (evt) => {
      let data = null;
      try { data = JSON.parse(evt.data || 'null'); } catch { data = { raw: evt.data }; }
      const at = new Date().toISOString();
      setEvent({ type, data, at });
      if (data && typeof data.status === 'string') setStatus(data.status);
      if (type === 'complete') setStatus('completed');
      if (type === 'failed')   setStatus('failed');
      try { onEventRef.current?.(type, data); } catch { /* callback failure isn't fatal */ }
    };

    es.addEventListener('hello',    () => setReady(true));
    es.addEventListener('progress', push('progress'));
    es.addEventListener('complete', push('complete'));
    es.addEventListener('failed',   push('failed'));
    es.addEventListener('requeued', push('requeued'));

    es.onerror = () => {
      // EventSource auto-retries. We surface the fact that we're currently
      // disconnected so the UI can dim/spinner if it wants.
      setReady(false);
      setError('stream-error');
    };

    return () => {
      try { es.close(); } catch { /* already closed */ }
    };
  }, [jobId, enabled]);

  return { status, event, ready, error };
}

export default useJobStream;
