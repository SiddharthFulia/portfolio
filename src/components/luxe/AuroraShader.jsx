// Full-screen aurora shader background (Three.js fragment shader port
// from "Animated Shader Background" in FE components). Renders a slow,
// auroral haze that drifts and pulses. Use as a fixed-position backdrop
// behind any luxe-stage section — set `fixed` to true for behind-everything
// placement, or false for an inline aurora panel.
//
// Lightweight: one orthographic plane + fragment shader, GPU-only. No
// per-frame React state, no setState calls.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { hasWebGL } from '../WebGLBoundary'

export default function AuroraShader({
  fixed = false,
  className = '',
  intensity = 1.5,
  zIndex = 0,
}) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Aurora is decorative — skip mounting entirely if WebGL is
    // unavailable or already exhausted. Wrapping the `new
    // WebGLRenderer` in try/catch is what prevents the prod
    // "Error creating WebGL context" throw from taking the page down.
    if (!hasWebGL()) return

    let scene, camera, renderer, material, geometry, mesh, frameId, onResize
    try {
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iIntensity: { value: intensity },
        iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
      fragmentShader: `
        uniform float iTime;
        uniform float iIntensity;
        uniform vec2 iResolution;
        #define NUM_OCTAVES 3

        float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 ip = floor(p); vec2 u = fract(p); u = u*u*(3.0-2.0*u);
          float res = mix(
            mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
            mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
          return res * res;
        }
        float fbm(vec2 x) {
          float v = 0.0; float a = 0.3; vec2 shift = vec2(100);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < NUM_OCTAVES; ++i) { v += a * noise(x); x = rot * x * 2.0 + shift; a *= 0.4; }
          return v;
        }
        void main() {
          vec2 shake = vec2(sin(iTime * 1.2) * 0.005, cos(iTime * 2.1) * 0.005);
          vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5) / iResolution.y * mat2(6.0, -4.0, 4.0, 6.0);
          vec2 v; vec4 o = vec4(0.0);
          float f = 2.0 + fbm(p + vec2(iTime * 5.0, 0.0)) * 0.5;
          for (float i = 0.0; i < 35.0; i++) {
            v = p + cos(i * i + (iTime + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5
                + vec2(sin(iTime * 3.0 + i) * 0.003, cos(iTime * 3.5 - i) * 0.003);
            float tailNoise = fbm(v + vec2(iTime * 0.5, i)) * 0.3 * (1.0 - (i / 35.0));
            vec4 auroraColors = vec4(
              0.1 + 0.3 * sin(i * 0.2 + iTime * 0.4),
              0.3 + 0.5 * cos(i * 0.3 + iTime * 0.5),
              0.7 + 0.3 * sin(i * 0.4 + iTime * 0.3), 1.0);
            vec4 currentContribution = auroraColors * exp(sin(i * i + iTime * 0.8)) /
                                       length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
            float thinnessFactor = smoothstep(0.0, 1.0, i / 35.0) * 0.6;
            o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
          }
          o = tanh(pow(o / 100.0, vec4(1.6)));
          gl_FragColor = o * iIntensity;
        }`,
    })

    geometry = new THREE.PlaneGeometry(2, 2)
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const animate = () => {
      material.uniforms.iTime.value += 0.016
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    onResize = () => {
      const w = container.clientWidth || window.innerWidth
      const h = container.clientHeight || window.innerHeight
      renderer.setSize(w, h)
      material.uniforms.iResolution.value.set(w, h)
    }
    window.addEventListener('resize', onResize)
    } catch (err) {
      // Fail soft — this shader is decorative. Chrome throws
      // "Error creating WebGL context" once the per-tab live-context
      // cap is hit; we swallow it here so the surrounding page still
      // renders normally.
      // eslint-disable-next-line no-console
      console.warn('[AuroraShader] WebGL init failed:', err?.message || err)
      return
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      if (onResize) window.removeEventListener('resize', onResize)
      if (renderer?.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      try {
        geometry?.dispose()
        material?.dispose()
        renderer?.dispose()
        renderer?.forceContextLoss?.()
        renderer?.getContext?.().getExtension?.('WEBGL_lose_context')?.loseContext?.()
      } catch { /* teardown best-effort */ }
    }
  }, [intensity])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`${fixed ? 'fixed' : 'absolute'} inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ zIndex }}
    />
  )
}
