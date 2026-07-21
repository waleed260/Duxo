import { useRef, useEffect, useCallback } from 'react'

export interface SmoothCursor {
  x: number
  y: number
}

export function useCursorPosition(
  containerRef: React.RefObject<HTMLElement | null>,
  lerpFactor = 0.1
) {
  const smooth = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const rafId = useRef(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    target.current.x = e.clientX
    target.current.y = e.clientY
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    smooth.current.x = rect.left + rect.width / 2
    smooth.current.y = rect.top + rect.height / 2
    target.current.x = smooth.current.x
    target.current.y = smooth.current.y

    window.addEventListener('mousemove', handleMouseMove)

    const tick = () => {
      smooth.current.x += (target.current.x - smooth.current.x) * lerpFactor
      smooth.current.y += (target.current.y - smooth.current.y) * lerpFactor
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(rafId.current)
    }
  }, [containerRef, handleMouseMove, lerpFactor])

  return smooth
}
