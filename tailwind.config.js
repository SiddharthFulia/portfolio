/** @type {import('tailwindcss').Config}
 *
 * Design tokens — three layers:
 *   1. Primitive    — Tailwind's defaults (slate, amber, rose, etc.) — DO NOT redefine,
 *                     just reference them through the semantic + component layers below.
 *   2. Semantic     — surface / fg / line / accent / state aliases. Use these everywhere
 *                     a UI surface or text colour is needed. They're stable across themes
 *                     so a future light-mode flip only edits this file.
 *   3. Component    — class helpers like luxe-card / btn-primary live in styles/luxe.css
 *                     via @layer components. Each one consumes the semantic tokens above.
 *
 * Custom spacing values are banned by convention — pick from Tailwind's default
 * 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px scale. If you need a value outside the scale,
 * write it inline with arbitrary values (e.g. `mt-[18px]`) so it doesn't pollute tokens.
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases — kept so any older component still resolves. New code
        // should prefer the semantic tokens below.
        gray: {
          200: "#D5DAE1",
        },
        black: {
          DEFAULT: "#000",
          500: "#1D2235",
        },
        blue: {
          500: "#2b77e7",
        },

        // ─── Semantic: surfaces (dark theme) ──────────────────────────
        surface: {
          base:     "#0a0a0e", // page background — set on every <section> wrapper
          elevated: "#13131a", // cards, modals, popovers — one layer above base
          overlay:  "#1a1a24", // nested chrome (tooltips, picker rows, sub-cards)
        },

        // ─── Semantic: foreground ─────────────────────────────────────
        fg: {
          primary:   "#f1f5f9", // body text + h1/h2 (mapped to slate-100)
          secondary: "#cbd5e1", // sub-titles, label text          (slate-300)
          muted:     "#64748b", // captions, helper copy           (slate-500)
        },

        // ─── Semantic: lines / borders ────────────────────────────────
        line: {
          DEFAULT: "#1f2937", // hairline borders                  (slate-800)
          strong:  "#374151", // emphasis borders + hover states   (slate-700)
        },

        // ─── Semantic: accents (mapped to Tailwind 500 of each scale) ─
        // Each accent has a defined emotional weight:
        //   amber   — primary brand, hero gradients, CTAs
        //   rose    — secondary brand, gradient stops, alerts
        //   fuchsia — tertiary brand, accent only
        //   cyan    — admin / settings / vault visuals
        //   emerald — success / ready / healthy states
        accent: {
          amber:   "#fbbf24",
          rose:    "#fb7185",
          fuchsia: "#d946ef",
          cyan:    "#22d3ee",
          emerald: "#34d399",
        },
      },

      fontFamily: {
        worksans: ["Work Sans", "sans-serif"],
        poppins:  ['Poppins', "sans-serif"],
        // Mono used for tabular numerics + eyebrows.
        mono:     ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      // ─── Type ramp — responsive via Tailwind's [size, lineHeight] tuple ───
      // Use these for any hero / section title; the sm: / md: variants apply
      // automatically through the second axis if the size has clamp() built in.
      fontSize: {
        display: ['clamp(2.25rem, 5vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }], // 36-56px
        h1:      ['clamp(1.875rem, 4vw, 2.5rem)',  { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '700' }], // 30-40px
        h2:      ['clamp(1.5rem, 3vw, 2rem)',     { lineHeight: '1.2',  letterSpacing: '-0.01em',  fontWeight: '600' }], // 24-32px
        h3:      ['1.25rem',  { lineHeight: '1.3', fontWeight: '600' }], // 20px
        body:    ['0.9375rem',{ lineHeight: '1.6' }],                    // 15px — comfortable read
        caption: ['0.75rem',  { lineHeight: '1.4' }],                    // 12px — chips, helper text
      },

      boxShadow: {
        // Legacy.
        card:     '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
        // New semantic ramp.
        subtle:   '0 1px 2px rgba(0,0,0,0.4)',
        elevated: '0 8px 24px -8px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3)',
        glow:     '0 0 24px -4px rgba(251, 113, 133, 0.35)', // rose-400 halo for hover states
      },

      // ─── Radii — pick from this ramp, don't invent new values ─────────
      borderRadius: {
        // Tailwind's defaults already give us none/sm/DEFAULT/md/lg/xl/2xl/3xl/full.
        // Adding nothing here on purpose — the defaults are good. Listed here so a
        // future migration can override in one place.
      },
    },
  },
  plugins: [],
}
