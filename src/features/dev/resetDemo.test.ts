import { describe, expect, it } from 'vitest'
import { resetDemoData } from './resetDemo'

function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
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

const keysOf = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.key(i)!)

describe('сброс демо-данных', () => {
  it('сносит снимок демо-данных', () => {
    const storage = fakeStorage({ 'tabel-demo': '{}' })
    resetDemoData(storage)
    expect(storage.getItem('tabel-demo')).toBeNull()
  })

  it('не трогает сессию Supabase — иначе выкинет из аккаунта', () => {
    const storage = fakeStorage({
      'tabel-demo': '{}',
      'sb-teubpcfclwlwiryugtxk-auth-token': 'сессия',
    })

    resetDemoData(storage)
    expect(storage.getItem('sb-teubpcfclwlwiryugtxk-auth-token')).toBe('сессия')
  })

  it('сносит и прочий мусор, накопленный приложением', () => {
    const storage = fakeStorage({ 'tabel-demo': '{}', theme: 'dark', 'sb-x-auth-token': 'с' })
    resetDemoData(storage)
    expect(keysOf(storage)).toEqual(['sb-x-auth-token'])
  })

  it('возвращает список снесённого', () => {
    const storage = fakeStorage({ 'tabel-demo': '{}', theme: 'dark', 'sb-x-auth-token': 'с' })
    expect(resetDemoData(storage).sort()).toEqual(['tabel-demo', 'theme'])
  })

  it('на пустом хранилище не падает', () => {
    expect(resetDemoData(fakeStorage({}))).toEqual([])
  })
})
