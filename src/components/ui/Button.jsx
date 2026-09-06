// <Button> — site-wide button component (antd-based).
//
// Why this wrapper exists:
//   1) Consistency — every page uses the same component, so styling
//      tweaks happen in one place. No more 50 hand-rolled flavours.
//   2) Bug guard — htmlType defaults to "button". Native HTML treats
//      a button inside a <form> as type="submit" unless told otherwise,
//      which silently submits the form (and on a Vite SPA can look like
//      a full page reload because the URL changes + React tears down).
//      This wrapper hard-defaults the right type so future <form> wraps
//      never re-introduce the reload bug.
//   3) Theme alignment — the project's dark UI doesn't map cleanly to
//      antd's stock light theme. Variants here translate the design
//      language (amber gradient primary, line-bordered ghost, etc.)
//      into a single name.
//
// Usage:
//   import Button from '../components/ui/Button'
//   <Button onClick={fn}>Default</Button>
//   <Button variant="primary" onClick={fn}>Generate</Button>
//   <Button variant="danger" icon={<DeleteOutlined/>} size="small">Delete</Button>
//
// Variants:
//   primary   — amber/rose gradient call-to-action
//   secondary — bordered ghost (default)
//   ghost     — transparent, faint border
//   subtle    — text-only chip
//   success   — emerald, used for "Save / Apply"
//   danger    — rose/red, used for destructive ops
//   accent    — fuchsia/violet, used for non-primary highlights
//
// All other antd Button props pass through (loading, icon, size, block,
// shape, href, target, …).

import { Button as AntButton } from 'antd'

// The string baked into Antd's `type` + `danger` props, plus the
// project-level className that tints / strokes the chrome. Keep the
// className list tight — Tailwind classes are easier to read than a
// blob of CSS-in-JS.
const VARIANTS = {
  primary: {
    type: 'primary',
    className:
      '!bg-amber-500 !border-amber-500 ' +
      'hover:!bg-amber-400 hover:!border-amber-400 ' +
      '!text-black',
  },
  secondary: {
    type: 'default',
    className:
      '!bg-gray-900/60 !border-gray-700 !text-gray-200 ' +
      'hover:!bg-gray-800 hover:!border-gray-600 hover:!text-white',
  },
  ghost: {
    type: 'default',
    ghost: true,
    className:
      '!border-gray-700/70 !text-gray-300 ' +
      'hover:!border-amber-400/60 hover:!text-amber-200',
  },
  subtle: {
    type: 'text',
    className:
      '!text-gray-400 hover:!text-white hover:!bg-white/[0.04]',
  },
  success: {
    type: 'default',
    className:
      '!bg-emerald-500/10 !border-emerald-500/40 !text-emerald-200 ' +
      'hover:!bg-emerald-500/20 hover:!border-emerald-400 hover:!text-emerald-100',
  },
  danger: {
    type: 'default',
    danger: true,
    className:
      '!bg-rose-500/10 !border-rose-500/40 !text-rose-200 ' +
      'hover:!bg-rose-500/20 hover:!border-rose-400 hover:!text-rose-100',
  },
  accent: {
    type: 'default',
    className:
      '!bg-fuchsia-500/10 !border-fuchsia-500/40 !text-fuchsia-200 ' +
      'hover:!bg-fuchsia-500/20 hover:!border-fuchsia-400 hover:!text-fuchsia-100',
  },
}

export default function Button({
  variant = 'secondary',
  className = '',
  htmlType,                                       // explicit override allowed
  type,                                           // antd `type` if caller insists
  children,
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.secondary
  // Caller-supplied `type` wins over the variant default — covers the
  // rare case where someone wants `variant="primary"` chrome but a
  // different antd semantic type underneath.
  const antType = type ?? v.type
  // Caller-supplied `htmlType` wins over our hard-default of "button".
  // Real submit buttons stay opt-in: <Button htmlType="submit"/>.
  // `sid-btn` is a marker class — see the "Button + label
  // visibility" block in src/styles/luxe.css. It flips
  // `white-space: nowrap` off so long labels wrap to two lines
  // instead of ellipsing under a sibling element on mobile.
  return (
    <AntButton
      type={antType}
      danger={v.danger}
      ghost={v.ghost}
      htmlType={htmlType ?? 'button'}
      className={`sid-btn ${v.className || ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </AntButton>
  )
}

// Re-export antd's Button.Group under a stable name so consumers who
// want a button group don't have to dip into antd directly.
Button.Group = AntButton.Group
