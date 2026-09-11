# Codex — game file conventions

> The public route lives at `/codex`, but files on disk still live under
> `src/pages/arcade/` and `src/components/arcade/`. This is deliberate:
> renaming 60+ files would have been pure churn on top of the "Arcade →
> Codex" rename. Only the hub page file itself (`Codex.jsx`) and the
> user-visible strings + routes were renamed. When you write a new game,
> add it here and give it a **user-visible name** matching how it should
> render on the hub grid.

## Two shapes: simple game vs. structured game

Small games (< 500 lines of source, one canvas + minimal state) stay as a
**single file**. Big games (> 500 lines, or games with meaningful physics
/ AI / procedural art) live inside a **folder** so each concern can be
split into its own file and reviewed independently.

### Simple (default)

```
src/pages/arcade/
  Blackjack.jsx        ← one file, under 500 lines
```

- The whole game — rules, engine, sprites, UI — lives in one component.
- Use `<GameShell>` from `src/components/arcade/GameShell.jsx`.
- Pass `rules` (array of `{heading, body}`) so the shell surfaces a `?`
  button that opens the rulebook modal.
- Pass `difficulty` + `onDifficultyChange` so the shell renders the
  segmented picker + top-bar pill and persists the choice to
  `codex.<slug>.difficulty`.

### Structured (folder)

```
src/pages/arcade/
  <Slug>/
    index.jsx        ← React shell — reads engine.js state, drives render
    engine.js        ← game state + physics + AI (pure, no React)
    sprites.jsx      ← SVG components + procedural canvas art
    rules.js         ← exports RULES = [{heading, body}] used by <GameRules>
    difficulty.js    ← preset configs + custom-tunable schema
```

Rules of thumb for structured games:

- **`engine.js`** — pure, no React. Exposes `createGame(config)` returning
  a plain-object state + a `step(state, dt, input) → state` reducer.
  Testable without a DOM. Import `Math.random` seeds explicitly so tests
  are deterministic.
- **`sprites.jsx`** — SVG or `<canvas>` painters, no gameplay logic.
  Small components / draw helpers only.
- **`rules.js`** — static array of `{ heading, body }` — passed to the
  `<GameRules>` modal via `<GameShell rules={RULES} />`.
- **`difficulty.js`** — export `PRESETS` (a map from mode-name to config)
  and `CUSTOM_SCHEMA` (a map from key → `{ label, min, max, step, default }`)
  consumed by `<DifficultySelect>`.
- **`index.jsx`** — thin React shell. Owns `useState` for
  `{state, mode, customValues}`, calls `engine.step()` in a
  `requestAnimationFrame` loop, and passes everything to `<GameShell>`.

## Naming conventions

- Filename is `PascalCase.jsx` — e.g. `SpaceInvaders.jsx`,
  `MissileCommand.jsx`.
- Route slug is `kebab-case` — e.g. `/codex/space-invaders`.
- The `gameRegistry.js` slug MUST match the route slug and is used by
  `<GameShell>` for the localStorage best-score key
  (`codex.<slug>.best`).

## localStorage keys

All persisted state uses the `codex.*` namespace:

| Key | What |
|---|---|
| `codex.<slug>.best`        | Best score (auto-tracked by shell) |
| `codex.<slug>.difficulty`  | Last-picked difficulty mode string |
| `codex.<slug>.custom`      | `{ key: value }` object for Custom mode |
| `codex.<slug>.*` (custom)  | Game-specific bespoke keys — please still prefix `codex.<slug>.` |

Old `arcade.<slug>.*` entries are transparently migrated forward by
`<GameShell>` on first read, so existing users don't lose progress.

## Migration checklist for existing games

When you refactor a `<500 lines` game into a folder because it grew:

1. Create `src/pages/arcade/<Slug>/index.jsx` — move the component in.
2. Extract engine logic (state + step reducer) into `engine.js`.
3. Extract art (SVG components, canvas painters) into `sprites.jsx`.
4. Move the rulebook array (or write one) to `rules.js`.
5. Move the difficulty preset table (or write one) to `difficulty.js`.
6. Update the lazy import in `src/App.jsx`:
   `import("./pages/arcade/<Slug>")` — no filename change; Vite will
   pick up `<Slug>/index.jsx` transparently.
7. Delete the old flat file.
