import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteUrl } from './siteUrl'

afterEach(() => vi.unstubAllEnvs())

describe('адрес сайта — для ссылки входа из письма', () => {
  it('в корне домена — корень', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(siteUrl()).toBe(`${window.location.origin}/`)
  })

  it('на GitHub Pages — с путём репозитория, а не корень gorgog.github.io', () => {
    vi.stubEnv('BASE_URL', '/challenge-tracker/')
    expect(siteUrl()).toBe(`${window.location.origin}/challenge-tracker/`)
  })
})
