// Public share page for a saved QR — reached via /qr/s/:id. Anyone
// with the link (assuming the row is public) can view + scan. Owners
// see extra controls (toggle public, delete, open in editor).
//
// The rendered QR uses the baked PNG preview stored server-side so we
// don't need to reproduce the entire QRCompiler pipeline here — the
// PNG was already scan-tested on the source device.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Skeleton, Switch, Tooltip } from 'antd';
import {
  ArrowLeftOutlined, CopyOutlined, DeleteOutlined,
  EditOutlined, LinkOutlined, EyeOutlined, WarningFilled,
} from '@ant-design/icons';
import { Button } from '../components/ui';
import { getQrSave, patchQrSave, deleteQrSave } from '../api/qrSaves';
import { notice } from '../lib/notice';

// Payload kinds that contain a secret we shouldn't paste in the clear
// on the share page. Wi-Fi is the obvious one (contains the password).
// For everything else we surface the payload verbatim so the visitor
// knows exactly what will happen when they scan.
const SENSITIVE_KINDS = new Set(['wifi']);

function maskPayload(payload, kind) {
  if (!SENSITIVE_KINDS.has(kind)) return payload;
  if (kind === 'wifi') {
    // WIFI:S:MyNet;T:WPA;P:hunter2!@;H:false;;
    return payload.replace(/(P:)([^;]*)/, (_m, prefix) => `${prefix}••••••••`);
  }
  return payload;
}

function KindPill({ kind }) {
  const label = (kind || '').toUpperCase();
  const colour = {
    url:   'from-amber-300 to-rose-300',
    text:  'from-slate-300 to-slate-500',
    wifi:  'from-cyan-300 to-blue-400',
    vcard: 'from-emerald-300 to-teal-400',
    sms:   'from-fuchsia-300 to-violet-400',
    email: 'from-amber-300 to-orange-400',
    geo:   'from-lime-300 to-emerald-400',
    upi:   'from-orange-300 to-rose-400',
    kofi:  'from-rose-300 to-fuchsia-400',
  }[kind] || 'from-slate-300 to-slate-500';
  return (
    <span className={`inline-block bg-gradient-to-r ${colour} bg-clip-text text-transparent text-[10px] uppercase tracking-widest font-bold`}>
      {label}
    </span>
  );
}

export default function QRShare() {
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [item, setItem] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Scan · Sid'; }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const data = await getQrSave(id);
        if (cancel) return;
        setItem(data?.item || null);
        setIsOwner(!!data?.isOwner);
      } catch (e) {
        if (!cancel) setErr(e.message || 'Not found');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/qr/s/${id}`;
  }, [id]);

  const displayPayload = useMemo(() => {
    if (!item) return '';
    return maskPayload(item.payload, item.payloadKind);
  }, [item]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      notice.success('Share link copied');
    } catch { notice.error('Could not copy — long-press the URL bar instead'); }
  };

  const copyPayload = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.payload);
      notice.success('Payload copied');
    } catch { notice.error('Could not copy'); }
  };

  const togglePublic = async (checked) => {
    if (!item) return;
    setBusy(true);
    try {
      const res = await patchQrSave(id, { public: checked });
      setItem((prev) => ({ ...prev, public: res?.item?.public ?? checked }));
      notice.success(checked ? 'Now public' : 'Now private');
    } catch (e) {
      notice.error(e.message || 'Could not update');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this saved QR? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deleteQrSave(id);
      notice.success('Deleted');
      nav('/qr');
    } catch (e) {
      notice.error(e.message || 'Could not delete');
      setBusy(false);
    }
  };

  return (
    <div className='min-h-screen bg-[#0a0a0e] text-fg-primary'>
      <div className='max-w-4xl mx-auto pt-24 md:pt-28 px-4 md:px-6 pb-16'>
        {/* Back link */}
        <div className='mb-4'>
          <Link to='/qr' className='inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg-primary transition-colors'>
            <ArrowLeftOutlined /> QR Compiler
          </Link>
        </div>

        {loading ? (
          <div className='luxe-glass p-6 md:p-8'>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : err ? (
          <div className='luxe-glass p-8 text-center'>
            <WarningFilled className='text-4xl text-rose-300 mb-3' />
            <h1 className='font-bold text-2xl mb-2'>QR not found</h1>
            <p className='text-fg-muted'>
              This link may be private or was deleted by its owner.
            </p>
            <div className='mt-6'>
              <Button variant='primary' onClick={() => nav('/qr')}>Design your own QR</Button>
            </div>
          </div>
        ) : item ? (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
            {/* Preview */}
            <div className='luxe-glass p-5 md:p-6 flex flex-col items-center'>
              <div className='mb-3 self-stretch flex items-center justify-between gap-3'>
                <div>
                  <KindPill kind={item.payloadKind} />
                  <h1 className='font-bold text-xl md:text-2xl mt-1 leading-tight'>
                    {item.title || 'Untitled QR'}
                  </h1>
                </div>
                <div className='text-right text-[11px] text-fg-muted flex items-center gap-1'>
                  <EyeOutlined /> {item.views}
                </div>
              </div>
              {item.pngDataUrl ? (
                <div className='rounded-lg overflow-hidden shadow-2xl bg-white'>
                  <img
                    src={item.pngDataUrl}
                    alt='QR code'
                    className='block w-full max-w-[420px] h-auto'
                  />
                </div>
              ) : (
                <div className='w-full max-w-[420px] aspect-square rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-fg-muted text-sm'>
                  No preview available
                </div>
              )}
              <div className='mt-3 text-xs text-fg-muted text-center'>
                Point your phone camera at the code to scan.
              </div>
            </div>

            {/* Meta */}
            <div className='luxe-glass p-5 md:p-6 flex flex-col gap-4'>
              <div>
                <div className='text-xs uppercase tracking-widest text-fg-muted mb-1'>Encoded payload</div>
                <div className='rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[12px] break-all max-h-40 overflow-y-auto'>
                  {displayPayload || <span className='opacity-60'>—</span>}
                </div>
                {SENSITIVE_KINDS.has(item.payloadKind) && (
                  <p className='text-[11px] text-fg-muted mt-1 leading-snug'>
                    Wi-Fi password is masked. Scanning the QR still connects normally.
                  </p>
                )}
              </div>

              <div className='flex flex-wrap gap-2'>
                <Button variant='primary' icon={<CopyOutlined />} onClick={copyPayload}>
                  Copy payload
                </Button>
                <Button variant='ghost' icon={<LinkOutlined />} onClick={copyLink}>
                  Copy share link
                </Button>
              </div>

              <div className='text-[11px] text-fg-muted leading-relaxed'>
                Saved {new Date(item.createdAt).toLocaleString()} · viewed {item.views} time{item.views === 1 ? '' : 's'}
              </div>

              {isOwner && (
                <div className='mt-3 pt-4 border-t border-white/10 space-y-3'>
                  <div className='text-xs uppercase tracking-widest text-fg-muted'>Owner controls</div>

                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <div className='text-sm font-bold'>Public share</div>
                      <div className='text-[11px] text-fg-muted'>
                        Off = only you can view this link.
                      </div>
                    </div>
                    <Tooltip title={item.public ? 'Public — anyone with the link' : 'Private — you only'}>
                      <Switch checked={!!item.public} onChange={togglePublic} loading={busy} />
                    </Tooltip>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Button variant='subtle' icon={<EditOutlined />} onClick={() => nav('/qr', { state: { restoreId: id } })}>
                      Open in editor
                    </Button>
                    <Button variant='danger' icon={<DeleteOutlined />} onClick={handleDelete} loading={busy}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
