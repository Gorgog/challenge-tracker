import { describe, expect, it } from 'vitest'
import { headline } from './words'

describe('headline — фраза сверху словами', () => {
  it('«то лучше, то хуже» — и строка с обоими числами', () => {
    expect(headline({ kind: 'band', tone: 'mixed', below: 7, above: 7, recorded: 14 }, 'all', 14)).toEqual({
      title: 'Последние 2 недели — то лучше, то хуже обычного',
      sub: 'ниже обычного — 7, выше — 7 из 14 полных дней',
    })
  })
  it('половины: «примерно как первая», у 30 дней — «первые 15 дней»', () => {
    expect(headline({ kind: 'halves', tone: 'usual', first: 7, second: 6.8 }, 'all', 14).title).toBe('Вторая неделя — примерно как первая')
    expect(headline({ kind: 'halves', tone: 'better', first: 6, second: 7 }, 'sleep', 30)).toEqual({
      title: 'Сон: вторые 15 дней лучше первых',
      sub: 'в среднем 7,0, первые 15 дней — 6,0',
    })
  })
  it('мало полных дней и нет полосы — сколько ещё нужно', () => {
    expect(headline({ kind: 'few', recorded: 1, need: 5 }, 'all', 30).title).toBe('Полных дней за 30 дней: 1 — для вывода нужно хотя бы 5')
    expect(headline({ kind: 'none', need: 3 }, 'all', 14).title).toBe('Ещё 3 полных дня — и покажем твоё обычное')
  })
  it('лучше обычного — сколько дней выше', () => {
    expect(headline({ kind: 'band', tone: 'better', below: 0, above: 8, recorded: 12 }, 'mood', 14)).toEqual({
      title: 'Настроение за последние 2 недели — лучше обычного',
      sub: '8 дней из 12 полных — выше твоего обычного',
    })
  })
})
