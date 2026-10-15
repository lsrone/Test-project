import { useEffect, useRef } from 'react'

export function WaveParticles({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const node = canvas.current
    const context = node?.getContext('2d')
    if (!node || !context) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const particles = Array.from({ length: 84 }, (_, i) => ({
      angle: (i / 84) * Math.PI * 2,
      orbit: 0.45 + Math.random() * 0.65,
      speed: 0.05 + Math.random() * 0.12,
      radius: 0.7 + Math.random() * 1.6,
      drift: Math.random() * Math.PI * 2,
    }))
    let width = 0,
      height = 0,
      frame = 0,
      last = 0,
      elapsed = 0
    function paint(time: number) {
      const ctx = context!
      ctx.clearRect(0, 0, width, height)
      const cx = width * 0.79,
        cy = height * 0.5,
        radius = Math.min(height * 0.6, width * 0.25)
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4)
      glow.addColorStop(0, '#699dff32')
      glow.addColorStop(0.55, '#416bdf18')
      glow.addColorStop(1, '#416bdf00')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
      for (let ring = 0; ring < 4; ring++) {
        ctx.beginPath()
        for (let i = 0; i <= 120; i++) {
          const angle = (i / 120) * Math.PI * 2
          const r = radius * (0.42 + ring * 0.16) + Math.sin(angle * 4 + time * 0.7 + ring) * 5
          const x = cx + Math.cos(angle) * r,
            y = cy + Math.sin(angle) * r * 0.62
          if (!i) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = `rgba(126,173,255,${0.16 - ring * 0.025})`
        ctx.lineWidth = 1
        ctx.stroke()
      }
      for (const particle of particles) {
        const angle = particle.angle + time * particle.speed
        const r = radius * particle.orbit + Math.sin(time * 0.45 + particle.drift) * 10
        const x = cx + Math.cos(angle) * r,
          y = cy + Math.sin(angle) * r * 0.65
        const brightness = 0.4 + (Math.sin(time + particle.drift) + 1) * 0.22
        ctx.beginPath()
        ctx.arc(x, y, particle.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(155,202,255,${brightness})`
        ctx.shadowColor = '#6da5ff'
        ctx.shadowBlur = 8
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }
    function animate(now: number) {
      if (last && now - last >= 32) {
        elapsed += Math.min(now - last, 80) / 1000
        paint(elapsed)
        last = now
      } else if (!last) last = now
      frame = requestAnimationFrame(animate)
    }
    function update() {
      cancelAnimationFrame(frame)
      node!.dataset.motion = active && !motion.matches ? 'running' : 'still'
      paint(elapsed)
      last = 0
      if (active && !motion.matches) frame = requestAnimationFrame(animate)
    }
    const resize = new ResizeObserver(() => {
      const bounds = node.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      const ratio = Math.min(devicePixelRatio || 1, 2)
      node.width = Math.round(width * ratio)
      node.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      paint(elapsed)
    })
    resize.observe(node)
    motion.addEventListener('change', update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      motion.removeEventListener('change', update)
    }
  }, [active])
  return <canvas ref={canvas} className="wave-particles" aria-hidden="true" />
}
