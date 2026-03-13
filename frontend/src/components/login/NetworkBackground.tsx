import { useEffect, useRef } from 'react'

interface Node { x: number; y: number; vx: number; vy: number; r: number }
interface Pulse { a: number; b: number; t: number; speed: number; red: boolean }

const MAX_DIST = 190
const MAX_DIST_SQ = MAX_DIST * MAX_DIST
const BG = '#010c1a'

export default function NetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let W = 0, H = 0
    let nodes: Node[] = []
    let pulses: Pulse[] = []
    let scanY = 0
    let lastSpawn = 0

    // ── Init ────────────────────────────────────────────
    const init = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W
      canvas.height = H
      scanY = Math.random() * H
      const count = Math.max(18, Math.min(52, Math.floor(W * H / 18000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 1.5 + Math.random() * 1.5,
      }))
      pulses = []
    }

    // ── Pulse spawner ───────────────────────────────────
    const spawnPulse = (now: number) => {
      if (now - lastSpawn < 350 || pulses.length >= 22) return
      lastSpawn = now
      for (let k = 0; k < 30; k++) {
        const i = Math.floor(Math.random() * nodes.length)
        const j = Math.floor(Math.random() * nodes.length)
        if (i === j) continue
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        if (dx * dx + dy * dy < MAX_DIST_SQ) {
          pulses.push({
            a: i, b: j, t: 0,
            speed: 0.003 + Math.random() * 0.005,
            red: Math.random() < 0.1,
          })
          return
        }
      }
    }

    // ── Draw ────────────────────────────────────────────
    const draw = (now: number) => {
      // Move nodes
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0)  { n.x = 0;  n.vx *= -1 }
        if (n.x > W)  { n.x = W;  n.vx *= -1 }
        if (n.y < 0)  { n.y = 0;  n.vy *= -1 }
        if (n.y > H)  { n.y = H;  n.vy *= -1 }
      }

      spawnPulse(now)
      pulses = pulses.filter(p => p.t < 1)

      // Background
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      ctx.lineCap = 'round'

      // ── Edges (glow pass then core) ──────────────────
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dSq = dx * dx + dy * dy
          if (dSq >= MAX_DIST_SQ) continue
          const alpha = 1 - Math.sqrt(dSq) / MAX_DIST

          // Soft glow halo
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.strokeStyle = `rgba(20, 110, 255, ${alpha * 0.13})`
          ctx.lineWidth = 5
          ctx.stroke()

          // Core line
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.strokeStyle = `rgba(50, 150, 255, ${alpha * 0.55})`
          ctx.lineWidth = 0.9
          ctx.stroke()
        }
      }

      // ── Nodes ────────────────────────────────────────
      ctx.shadowBlur = 12
      ctx.shadowColor = '#1a7fff'
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(90, 170, 255, 0.88)'
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // ── White pulses ─────────────────────────────────
      ctx.shadowBlur = 14
      ctx.shadowColor = '#b0d8ff'
      for (const p of pulses) {
        if (p.red) continue
        p.t += p.speed
        const na = nodes[p.a], nb = nodes[p.b]
        const px = na.x + (nb.x - na.x) * p.t
        const py = na.y + (nb.y - na.y) * p.t
        ctx.beginPath()
        ctx.arc(px, py, 2.8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(230, 245, 255, 0.95)'
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // ── Red alert pulses ─────────────────────────────
      ctx.shadowBlur = 16
      ctx.shadowColor = '#ff2020'
      for (const p of pulses) {
        if (!p.red) continue
        p.t += p.speed
        const na = nodes[p.a], nb = nodes[p.b]
        const px = na.x + (nb.x - na.x) * p.t
        const py = na.y + (nb.y - na.y) * p.t
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 55, 55, 0.92)'
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // ── Red scan line ────────────────────────────────
      scanY = (scanY + 0.14) % H

      // Diffuse glow band
      const grad = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50)
      grad.addColorStop(0,   'transparent')
      grad.addColorStop(0.5, 'rgba(190, 20, 20, 0.07)')
      grad.addColorStop(1,   'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, scanY - 50, W, 100)

      // Thin line
      ctx.beginPath()
      ctx.moveTo(0, scanY)
      ctx.lineTo(W, scanY)
      ctx.strokeStyle = 'rgba(210, 35, 35, 0.38)'
      ctx.lineWidth = 1
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(255, 30, 30, 0.55)'
      ctx.stroke()
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(draw)
    }

    init()
    const ro = new ResizeObserver(init)
    ro.observe(canvas)
    raf = requestAnimationFrame(draw)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      style={{ display: 'block' }}
    />
  )
}
