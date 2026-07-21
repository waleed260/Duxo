import { useRef, useEffect } from 'react'
import { useCursorPosition } from '../hooks/useCursorPosition'

const RADIUS = 260
const STOPS: [number, number][] = [
  [0.0, 1],
  [0.4, 1],
  [0.60, 0.75],
  [0.75, 0.40],
  [0.88, 0.12],
  [1.0, 0.0],
]

const FRONT_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260713_162101_0d7498c5-29bb-47bf-a99f-2773c0a880a9.mp4'

export default function SpotlightReveal() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const maskRef = useRef<HTMLDivElement>(null)
  const smooth = useCursorPosition(containerRef, 0.1)

  useEffect(() => {
    const canvas = canvasRef.current
    const mask = maskRef.current
    if (!canvas || !mask) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let raf: number
    const tick = () => {
      const { x, y } = smooth.current
      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, RADIUS)
      for (const [t, a] of STOPS) {
        gradient.addColorStop(t, `rgba(255,255,255,${a})`)
      }

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)

      const dataUrl = canvas.toDataURL()
      mask.style.webkitMaskImage = `url(${dataUrl})`
      mask.style.maskImage = `url(${dataUrl})`

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [smooth])

  return (
    <div ref={containerRef} className="absolute inset-0 z-30 pointer-events-none">
      <canvas ref={canvasRef} className="hidden" />
      <div
        ref={maskRef}
        className="absolute inset-0"
        style={{
          clipPath: 'inset(40% 0 0 0)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={FRONT_VIDEO} type="video/mp4" />
        </video>
      </div>
    </div>
  )
}
