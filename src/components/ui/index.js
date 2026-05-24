// Site-wide UI primitives. Import from here, not from `antd` directly,
// for any control that has a wrapper:
//
//   ✅  import { Button, Slider } from '../components/ui'
//   ❌  import { Button, Slider } from 'antd'   ← bypasses the consistency layer
//
// The wrappers default to safe HTML semantics (button type="button")
// and the project's dark-theme palette. New shared primitives go here.

export { default as Button } from './Button'
export { default as Slider } from './Slider'
