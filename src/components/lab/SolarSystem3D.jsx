import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const PLANETS = [
  { name: 'Mercury', r: 0.3,  dist: 3,   speed: 4.7,  color: '#b5b5b5', emissive: '#333' },
  { name: 'Venus',   r: 0.5,  dist: 4.5, speed: 3.5,  color: '#e8cda0', emissive: '#5a3a00' },
  { name: 'Earth',   r: 0.55, dist: 6,   speed: 2.9,  color: '#4fa3e0', emissive: '#0a2a40' },
  { name: 'Mars',    r: 0.4,  dist: 7.8, speed: 2.4,  color: '#c1440e', emissive: '#3a1000' },
  { name: 'Jupiter', r: 1.2,  dist: 11,  speed: 1.3,  color: '#c88b3a', emissive: '#3a2200' },
  { name: 'Saturn',  r: 1.0,  dist: 14,  speed: 0.97, color: '#e4d191', emissive: '#3a3200', ring: true },
  { name: 'Uranus',  r: 0.7,  dist: 17,  speed: 0.68, color: '#7de8e8', emissive: '#003a3a' },
  { name: 'Neptune', r: 0.65, dist: 20,  speed: 0.54, color: '#3f54ba', emissive: '#0a1240' },
]

const SolarSystem3D = () => {
  const mountRef = useRef()

  useEffect(() => {
    const mount = mountRef.current
    const W = mount.clientWidth, H = mount.clientHeight

    // Scene
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1000)
    camera.position.set(0, 18, 28)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000010, 1)
    mount.appendChild(renderer.domElement)

    // Stars background
    const starGeo = new THREE.BufferGeometry()
    const starVerts = []
    for (let i = 0; i < 4000; i++) {
      starVerts.push((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 })))

    // Sun
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1 })
    )
    scene.add(sun)

    // Sun glow
    const glowGeo = new THREE.SphereGeometry(2.0, 32, 32)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.12, side: THREE.BackSide })
    scene.add(new THREE.Mesh(glowGeo, glowMat))

    // Light from sun
    scene.add(new THREE.PointLight(0xfff0dd, 3, 80))
    scene.add(new THREE.AmbientLight(0x111133, 0.5))

    // Planets
    const planetMeshes = PLANETS.map(p => {
      // Orbit ring
      const orbitGeo = new THREE.RingGeometry(p.dist - 0.02, p.dist + 0.02, 128)
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0x334455, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
      scene.add(new THREE.Mesh(orbitGeo, orbitMat))

      // Planet
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 24, 24),
        new THREE.MeshStandardMaterial({ color: p.color, emissive: p.emissive, roughness: 0.8 })
      )
      scene.add(mesh)

      // Saturn ring
      if (p.ring) {
        const ringGeo = new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 64)
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8b060, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.rotation.x = Math.PI / 3
        mesh.add(ring)
      }

      return { mesh, ...p, angle: Math.random() * Math.PI * 2 }
    })

    // Mouse + touch drag to rotate
    let drag = false, lastX = 0, lastY = 0
    let rotY = 0, rotX = 0.3
    const getXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY]
    const onDown = e => { drag = true; ;[lastX, lastY] = getXY(e) }
    const onUp = () => { drag = false }
    const onMove = e => {
      if (!drag) return
      const [cx, cy] = getXY(e)
      rotY += (cx - lastX) * 0.005
      rotX = Math.max(-0.8, Math.min(0.8, rotX + (cy - lastY) * 0.005))
      lastX = cx; lastY = cy
    }
    mount.addEventListener('mousedown', onDown)
    mount.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: true })

    // Resize
    const onResize = () => {
      const W = mount.clientWidth, H = mount.clientHeight
      camera.aspect = W / H; camera.updateProjectionMatrix()
      renderer.setSize(W, H)
    }
    window.addEventListener('resize', onResize)

    let animId, t = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      t += 0.005

      sun.rotation.y += 0.004

      planetMeshes.forEach(p => {
        p.angle += p.speed * 0.004
        p.mesh.position.x = Math.cos(p.angle) * p.dist
        p.mesh.position.z = Math.sin(p.angle) * p.dist
        p.mesh.rotation.y += 0.01
      })

      // Smooth camera rotation from drag
      camera.position.x = 30 * Math.sin(rotY) * Math.cos(rotX)
      camera.position.y = 30 * Math.sin(rotX) + 10
      camera.position.z = 30 * Math.cos(rotY) * Math.cos(rotX)
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      mount.removeEventListener('mousedown', onDown)
      mount.removeEventListener('touchstart', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('resize', onResize)
      mount.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [])

  return (
    <div className='bg-gray-900 rounded-xl overflow-hidden'>
      <div ref={mountRef} className='w-full cursor-grab active:cursor-grabbing' style={{ height: '520px' }} />
      <div className='px-5 py-3 border-t border-gray-800 flex flex-wrap gap-4'>
        {PLANETS.map(p => (
          <span key={p.name} className='flex items-center gap-1.5 text-xs text-gray-400'>
            <span className='w-2.5 h-2.5 rounded-full inline-block' style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
        <span className='ml-auto text-xs text-gray-600'>Drag to rotate · Real orbital speed ratios</span>
      </div>
    </div>
  )
}

export default SolarSystem3D
