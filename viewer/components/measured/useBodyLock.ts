'use client'

import { useEffect } from 'react'

/**
 * Locks body scroll while a full-screen overlay (e.g. MobileMenu) is open.
 * Pairs with the `.menu-open` rule in styles/globals.css.
 */
export function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (locked) {
      document.body.classList.add('menu-open')
    } else {
      document.body.classList.remove('menu-open')
    }
    return () => document.body.classList.remove('menu-open')
  }, [locked])
}
