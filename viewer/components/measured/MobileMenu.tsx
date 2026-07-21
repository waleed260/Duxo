'use client'

import { useEffect } from 'react'
import { useBodyLock } from './useBodyLock'

const navItems = ['Device', 'Real Stories', 'Science', 'Plans', 'Reach Us']

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

export default function MobileMenu({ open, onClose }: MobileMenuProps) {
  useBodyLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[#0a0a0a]">
      <div className="flex justify-end px-4 pt-4 sm:px-6 md:px-10">
        <button
          onClick={onClose}
          className="liquid-glass w-10 h-10 flex items-center justify-center rounded-full"
        >
          <div className="relative w-5 h-5">
            <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white rounded-full rotate-45 translate-y-[-0.75px]" />
            <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white rounded-full -rotate-45 translate-y-[-0.75px]" />
          </div>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        {navItems.map((item, i) => (
          <button
            key={item}
            onClick={onClose}
            className="text-3xl sm:text-4xl text-white/90 font-medium"
            style={{
              animation: open
                ? `measured-slideUp 0.6s cubic-bezier(0.77, 0, 0.18, 1) ${100 + i * 60}ms both`
                : 'none',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex justify-center pb-12">
        <button
          className="liquid-glass flex items-center gap-3 px-8 py-3 rounded-full text-white text-sm font-medium"
          style={{
            animation: open
              ? `measured-slideUp 0.6s cubic-bezier(0.77, 0, 0.18, 1) ${100 + navItems.length * 60}ms both`
              : 'none',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Reserve Yours
        </button>
      </div>
    </div>
  )
}
