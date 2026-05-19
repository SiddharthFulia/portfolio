import { notification, message } from 'antd'
import {
  CheckCircleFilled, CloseCircleFilled, InfoCircleFilled,
  LoadingOutlined, CloudUploadOutlined, AudioFilled,
} from '@ant-design/icons'

// Single source of truth for toasts. Wraps AntD's `notification` so every
// banner across the app has the same dark, branded look — slides in from
// the top-right, distinct icon + accent border per kind, sticky for
// long-running ops, dismissible.
//
// Why notification and not message? `message` is a small grey pill at
// top-center — easy to miss and impossible to brand cleanly. Upload /
// transcribe / generate are real events that deserve a card.

// Global placement + duration — runs once at import time.
notification.config({ placement: 'topRight', top: 80, duration: 3.5 })
message.config({ top: 80, duration: 2.2, maxCount: 3 })

const card = {
  borderRadius: 14,
  background: 'rgba(13, 13, 20, 0.96)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(75, 85, 99, 0.45)',
  color: '#e5e7eb',
  boxShadow: '0 18px 50px rgba(0, 0, 0, 0.6)',
  padding: 14,
}

const titleStyle = { color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: 0.1 }
const descStyle  = { color: '#d1d5db', fontSize: 12, lineHeight: 1.5 }
const descErr    = { color: '#fecaca', fontSize: 12, lineHeight: 1.5 }

const make = ({ title, desc, icon, accent, key, duration }) => ({
  message: <span style={titleStyle}>{title}</span>,
  description: <span style={accent === 'error' ? descErr : descStyle}>{desc}</span>,
  icon,
  style: {
    ...card,
    borderColor: {
      success: 'rgba(16, 185, 129, 0.5)',
      error:   'rgba(239, 68, 68, 0.55)',
      info:    'rgba(6, 182, 212, 0.45)',
      load:    'rgba(124, 58, 237, 0.5)',
      upload:  'rgba(124, 58, 237, 0.5)',
      mic:     'rgba(245, 158, 11, 0.5)',
    }[accent] || card.borderColor,
  },
  key,
  duration,
})

export const notify = {
  success: (desc, { title = 'Done', key } = {}) =>
    notification.open(make({
      title, desc, accent: 'success', key,
      icon: <CheckCircleFilled style={{ color: '#10b981', fontSize: 20 }} />,
    })),

  error: (desc, { title = 'Something went wrong', key } = {}) =>
    notification.open(make({
      title, desc, accent: 'error', key, duration: 5,
      icon: <CloseCircleFilled style={{ color: '#ef4444', fontSize: 20 }} />,
    })),

  info: (desc, { title = 'Heads up', key } = {}) =>
    notification.open(make({
      title, desc, accent: 'info', key,
      icon: <InfoCircleFilled style={{ color: '#06b6d4', fontSize: 20 }} />,
    })),

  // Sticky until close() is called — pair with .success/.error using the
  // same key to swap in place.
  loading: (desc, { title = 'Working…', key } = {}) =>
    notification.open(make({
      title, desc, accent: 'load', key, duration: 0,
      icon: <LoadingOutlined spin style={{ color: '#06b6d4', fontSize: 20 }} />,
    })),

  uploading: (desc, { key } = {}) =>
    notification.open(make({
      title: 'Uploading', desc, accent: 'upload', key, duration: 0,
      icon: <CloudUploadOutlined spin style={{ color: '#a78bfa', fontSize: 20 }} />,
    })),

  recording: (desc, { key } = {}) =>
    notification.open(make({
      title: 'Recording', desc, accent: 'mic', key, duration: 0,
      icon: <AudioFilled style={{ color: '#fbbf24', fontSize: 20 }} />,
    })),

  // Close a sticky toast by key.
  close: (key) => notification.destroy(key),
}

export default notify
