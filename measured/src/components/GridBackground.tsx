import { useRef, useEffect, useState } from 'react'
import { useCursorPosition } from '../hooks/useCursorPosition'

const CELL = 48

export default function GridBackground() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const smooth = useCursorPosition(sectionRef, 0.06)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    const tick = () => {
      const dx = (smooth.current.x - cx) * 16
      const dy = (smooth.current.y - cy) * 16
      setOffset({ x: dx, y: dy })
      requestAnimationFrame(tick)
    }
    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [smooth])

  return (
    <div
      ref={sectionRef}
      className="absolute inset-0 z-0 opacity-10 pointer-events-none"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        willChange: 'transform',
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} stroke="#64748b" strokeWidth={0.6} fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  )
}
