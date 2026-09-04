// Global SVG filter for refractive glass surfaces.
//
// Mount once at the app root. Any element with class `luxe-glass` picks up
// the filter via `backdrop-filter: url(#luxe-glass-filter)` — that adds
// real light distortion (fractal noise → displacement map) on top of the
// blur, instead of the flat frosted-blur most portfolios ship.
//
// The SVG itself is 0×0 so it never occupies layout. Renders once per
// page mount; no state, no re-renders.

export default function GlassFilter() {
  return (
    <svg
      width='0'
      height='0'
      aria-hidden='true'
      style={{ position: 'absolute', pointerEvents: 'none', width: 0, height: 0 }}
    >
      <defs>
        {/* Fractal-noise turbulence + light displacement. baseFrequency
            tuned so the distortion reads as glass, not shattered
            plastic. scale controls how strong the refraction is. */}
        <filter id='luxe-glass-filter' x='0%' y='0%' width='100%' height='100%'>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.008 0.012'
            numOctaves='2'
            seed='7'
            result='noise'
          />
          <feDisplacementMap
            in='SourceGraphic'
            in2='noise'
            scale='36'
            xChannelSelector='R'
            yChannelSelector='G'
          />
        </filter>
      </defs>
    </svg>
  );
}
