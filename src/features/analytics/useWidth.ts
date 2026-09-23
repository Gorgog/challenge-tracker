import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Ширина контейнера: график рисуется в настоящих пикселях, чтобы подписи не сжимались на телефоне.
 * Первый замер — сразу при монтировании: наблюдатель срабатывает только вместе с кадрами, а в
 * скрытой вкладке их нет (errors.md).
 */
export function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (measured: number) => {
      if (measured > 0) setWidth(Math.max(260, Math.round(measured)))
    }
    apply(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => entry && apply(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
