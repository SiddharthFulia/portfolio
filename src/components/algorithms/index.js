// Barrel — shared primitives for `/algorithms/*` topic pages.
//
// Sibling agents authoring a visualiser page typically pull in:
//
//   import {
//     TopicShell,
//     ExplanationBlock, TeX,
//     VisualiserSection, VizPanel, ControlsPanel,
//     StepControls, useStepEngine,
//     Field, TextInput, Chip, OperationLog,
//     ArrayViz, GraphViz, TreeViz, GridViz,
//     PseudocodeBlock, ComplexityTable, RealWorldCard,
//   } from '../../components/algorithms'
//
// Topic catalog exports (for the hub / sidebar / chip bar):
//   TOPICS, TOPICS_BY_SLUG, CATEGORIES, FILTERS, FEATURED_SLUGS
//
// Palette exports (for pages that render their own cells / nodes):
//   STATE_COLORS, NODE_COLORS, EDGE_COLORS, TREE_NODE_COLORS, GRID_STATE_COLORS

/* Layout + hero */
export { default as TopicShell } from './TopicShell'

/* Layout wrappers + form primitives + small pieces */
export {
  VisualiserSection,
  VizPanel,
  ControlsPanel,
  Field,
  TextInput,
  Chip,
  OperationLog,
} from './layout'

/* Transport + animation engine */
export { default as StepControls } from './StepControls'
export { default as useStepEngine } from './useStepEngine'

/* Visualisers */
export { default as ArrayViz, STATE_COLORS } from './ArrayViz'
export { default as GraphViz, NODE_COLORS, EDGE_COLORS } from './GraphViz'
export { default as TreeViz, TREE_NODE_COLORS } from './TreeViz'
export { default as GridViz, GRID_STATE_COLORS } from './GridViz'

/* Below-fold blocks */
export { default as ComplexityTable } from './ComplexityTable'
export { default as ExplanationBlock, TeX } from './ExplanationBlock'
export { default as PseudocodeBlock } from './PseudocodeBlock'
export { default as MultiLangCode } from './MultiLangCode'
export { default as RealWorldCard } from './RealWorldCard'

/* Topic catalog (used by hub + sidebar) */
export {
  TOPICS,
  TOPICS_BY_SLUG,
  CATEGORIES,
  FILTERS,
  FEATURED_SLUGS,
} from './topics'
