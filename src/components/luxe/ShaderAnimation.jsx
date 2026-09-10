import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import WebGLBoundary, { hasWebGL } from '../WebGLBoundary'

/**
 * ShaderAnimation
 * Full-bleed animated shader using three.js raw shaders.
 * Sizes to its container — pass `className` to control width/height.
 */
const ShaderAnimationInner = ({ className = 'w-full h-screen' }) => {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Skip the entire Three.js setup if the browser has no WebGL —
    // the boundary would swap us out anyway, but this avoids the
    // synchronous throw + console.error noise.
    if (!hasWebGL()) return

    // Vertex shader
    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `

    // Fragment shader
    const fragmentShader = `
      #define TWO_PI 6.2831853072
      #define PI 3.14159265359

      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t = time*0.05;
        float lineWidth = 0.002;

        vec3 color = vec3(0.0);
        for(int j = 0; j < 3; j++){
          for(int i=0; i < 5; i++){
            color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*5.0 - length(uv) + mod(uv.x+uv.y, 0.2));
          }
        }

        gl_FragColor = vec4(color[0],color[1],color[2],1.0);
      }
    `

    // Scene setup
    const camera = new THREE.Camera()
    camera.position.z = 1

    const scene = new THREE.Scene()
    const geometry = new THREE.PlaneGeometry(2, 2)

    const uniforms = {
      time: { value: 1.0 },
      resolution: { value: new THREE.Vector2() },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const onWindowResize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      uniforms.resolution.value.x = renderer.domElement.width
      uniforms.resolution.value.y = renderer.domElement.height
    }
    onWindowResize()
    window.addEventListener('resize', onWindowResize, false)

    let animationId = 0
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      uniforms.time.value += 0.05
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.removeEventListener('resize', onWindowResize)
      cancelAnimationFrame(animationId)
      if (renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      geometry.dispose()
      material.dispose()
      try {
        renderer.dispose()
        renderer.forceContextLoss?.()
        renderer.getContext?.().getExtension?.('WEBGL_lose_context')?.loseContext?.()
      } catch { /* teardown best-effort */ }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#000', overflow: 'hidden' }}
    />
  )
}

// Wrap in a boundary so a lost / exhausted WebGL context doesn't take
// the whole page down — the shader is only decorative.
const ShaderAnimation = (props) => (
  <WebGLBoundary>
    <ShaderAnimationInner {...props} />
  </WebGLBoundary>
)

export default ShaderAnimation
