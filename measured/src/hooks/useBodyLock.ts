import { useEffect } from 'react'

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
