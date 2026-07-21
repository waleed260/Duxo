'use client'

import { useState } from 'react'
import MobileMenu from './MobileMenu'

const navItems = ['Device', 'Real Stories', 'Science', 'Plans', 'Reach Us']

function LogoSvg() {
  return (
    <svg viewBox="0 0 256 256" fill="white" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
      <path d="M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 96 95 L 63.5 128 L 64 128 L 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 64 L 64 0 L 192 0 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z" />
    </svg>
  )
}

function Hamburger() {
  return (
    <div className="flex flex-col items-end gap-[5px]">
      <div className="w-5 h-[1.5px] bg-white rounded-full" />
      <div className="w-3.5 h-[1.5px] bg-white rounded-full" />
    </div>
  )
}

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 md:px-10 h-16 md:h-20">
        <div className="flex items-center">
          <LogoSvg />
        </div>

        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2">
          <div className="liquid-glass flex items-center gap-1 rounded-full px-1.5 py-1">
            {navItems.map((item) => (
              <button
                key={item}
                className="px-4 py-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors rounded-full whitespace-nowrap"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden md:flex items-center">
          <button className="liquid-glass flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium text-white">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Reserve Yours
          </button>
        </div>

        <button
          className="md:hidden liquid-glass w-10 h-10 flex items-center justify-center rounded-full"
          onClick={() => setMenuOpen(true)}
        >
          <Hamburger />
        </button>
      </nav>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
