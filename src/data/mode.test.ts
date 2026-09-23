import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { MODE_KEY, isDemo, setDemo, watchMode } from './mode'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

describe('режим: база или демо', () => {
  it('по умолчанию — база', () => {
    expect(isDemo(fakeStorage())).toBe(false)
    expect(isDemo(null)).toBe(false)
  })

  it('включить и выключить демо', () => {
    const s = fakeStorage()
    setDemo(true, s)
    expect(s.getItem(MODE_KEY)).toBe('demo')
    expect(isDemo(s)).toBe(true)
    setDemo(false, s)
    expect(s.getItem(MODE_KEY)).toBeNull()
    expect(isDemo(s)).toBe(false)
  })

  it('режим сменили в другой вкладке — эта перезагружается, чтобы плашка и хранилище не разошлись', () => {
    const reload = vi.fn()
    const stop = watchMode(reload)
    window.dispatchEvent(new StorageEvent('storage', { key: 'tabel-demo' }))
    expect(reload).not.toHaveBeenCalled()
    window.dispatchEvent(new StorageEvent('storage', { key: MODE_KEY }))
    expect(reload).toHaveBeenCalledTimes(1)
    stop()
    window.dispatchEvent(new StorageEvent('storage', { key: MODE_KEY }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('хранилище бросает (приватное окно) — база, без падения', () => {
    const broken = {
      getItem: () => {
        throw new Error('запрещено')
      },
      setItem: () => {
        throw new Error('запрещено')
      },
      removeItem: () => {
        throw new Error('запрещено')
      },
    } as unknown as Storage
    expect(isDemo(broken)).toBe(false)
    expect(() => setDemo(true, broken)).not.toThrow()
  })
})
