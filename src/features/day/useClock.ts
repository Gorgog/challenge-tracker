import { useCallback, useEffect, useState } from 'react'

/**
 * Текущее время экрана дня. Обновляется раз в минуту, при возврате во вкладку и по запросу:
 * страница, открытая с вечера, не должна жить во вчерашнем дне, а плашка про утро — обещать
 * вопросы, когда утренний час уже прошёл.
 */
export function useClock(): { now: Date; refresh: () => void } {
  const [now, setNow] = useState(() => new Date())
  const refresh = useCallback(() => setNow(new Date()), [])

  useEffect(() => {
    const id = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  return { now, refresh }
}
