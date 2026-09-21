import { describe, expect, it } from 'vitest'
import { DAY_TAGS } from './tags'

describe('теги дня', () => {
  it('в вечерних тегах нет «мало спал»: сон спрашивается утром шкалой', () => {
    expect([...DAY_TAGS] as string[]).not.toContain('мало спал')
  })
})
