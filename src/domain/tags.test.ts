import { describe, expect, it } from 'vitest'
import { DAY_TAGS, LEVELS, levelLabel, validLevels } from './tags'

describe('теги дня', () => {
  it('в вечерних тегах нет «мало спал»: сон спрашивается утром шкалой', () => {
    expect([...DAY_TAGS] as string[]).not.toContain('мало спал')
  })

  it('срез 5б: старый порядок сохранён, новые теги — в конце', () => {
    expect([...DAY_TAGS]).toEqual([
      'выходной', 'дедлайн', 'болел', 'алкоголь', 'дорога', 'встречи', 'ссора', 'учёба', 'отдых',
      'игры', 'стресс', 'работа допоздна',
    ])
  })
})

describe('срез 5б: LEVELS — ступени тегов с количеством', () => {
  it('ключи LEVELS — подмножество DAY_TAGS', () => {
    const tags = new Set(DAY_TAGS as readonly string[])
    for (const tag of Object.keys(LEVELS)) expect(tags.has(tag)).toBe(true)
  })

  it('число ступеней: алкоголь 3, игры 4, стресс 3, работа допоздна 3', () => {
    expect(LEVELS['алкоголь']!.short).toHaveLength(3)
    expect(LEVELS['игры']!.short).toHaveLength(4)
    expect(LEVELS['стресс']!.short).toHaveLength(3)
    expect(LEVELS['работа допоздна']!.short).toHaveLength(3)
  })

  it('short и long — одинаковой длины у каждого тега', () => {
    for (const tag of Object.keys(LEVELS)) expect(LEVELS[tag]!.long).toHaveLength(LEVELS[tag]!.short.length)
  })

  it('LEVELS — точный литерал по договору (§1): ни лишнего ключа, ни другой подписи, note только у алкоголя', () => {
    // toEqual (а не toMatchObject/toHaveLength по частям) — иначе лишний ключ, неверная подпись или note
    // не у алкоголя проходят тест (находка первого чекера, п.8)
    expect(LEVELS).toEqual({
      'алкоголь': {
        question: 'Алкоголь — сколько?',
        short: ['1–2', '3–5', '6+'],
        long: ['1–2 порции', '3–5 порций', '6+ порций'],
        note: '1 порция ≈ бокал вина 100 мл, 0,25 л пива или рюмка 30 мл крепкого',
      },
      'игры': {
        question: 'Игры — сколько часов?',
        short: ['<1 ч', '1–2 ч', '3–4 ч', '5+ ч'],
        long: ['<1 ч', '1–2 ч', '3–4 ч', '5+ ч'],
      },
      'стресс': {
        question: 'Стресс — насколько?',
        short: ['немного', 'сильно', 'очень'],
        long: ['немного', 'сильно', 'очень сильно'],
      },
      'работа допоздна': {
        question: 'Работа допоздна — сколько сверх обычного?',
        short: ['до 1 ч', '1–3 ч', '3+ ч'],
        long: ['до 1 ч', '1–3 ч', '3+ ч'],
      },
    })
  })
})

describe('срез 5б: levelLabel', () => {
  it('короткая и полная подпись ступени — по примеру из договора', () => {
    expect(levelLabel('алкоголь', 2)).toBe('3–5')
    expect(levelLabel('алкоголь', 2, 'long')).toBe('3–5 порций')
  })

  it('нет ступени (undefined) — null', () => {
    expect(levelLabel('алкоголь', undefined)).toBeNull()
  })

  it('тег без ступеней (например «дорога») — null, даже с числом', () => {
    expect(levelLabel('дорога', 1)).toBeNull()
  })

  it('максимум — свой на тег: ступень 4 у алкоголя (только 3 ступени) — null, у игр (4 ступени) — «5+ ч»', () => {
    // мутант с общим для всех тегов максимумом (например «level <= 3 иначе null») здесь бы выжил
    expect(levelLabel('алкоголь', 4)).toBeNull()
    expect(levelLabel('игры', 4)).toBe('5+ ч')
    expect(levelLabel('игры', 4, 'long')).toBe('5+ ч') // у игр long совпадает с short
  })
})

describe('срез 5б: validLevels', () => {
  it('ступень отмеченного тега из LEVELS, целая, в диапазоне — ок', () => {
    expect(validLevels(['алкоголь', 'дорога'], { 'алкоголь': 2 })).toBe(true)
  })

  it('пусто, {} или undefined — ок (ступеней нет)', () => {
    expect(validLevels(['алкоголь'], {})).toBe(true)
    expect(validLevels(['алкоголь'], undefined)).toBe(true)
    expect(validLevels([], undefined)).toBe(true)
  })

  it('ключ не из отмеченных тегов — отказ', () => {
    expect(validLevels(['дорога'], { 'алкоголь': 2 })).toBe(false)
  })

  it('тег без ступеней (например «дорога») — отказ, даже если отмечен', () => {
    expect(validLevels(['дорога'], { 'дорога': 1 })).toBe(false)
  })

  it('значение вне 1…n — отказ (0 и 4 для алкоголя, у которого три ступени)', () => {
    expect(validLevels(['алкоголь'], { 'алкоголь': 0 })).toBe(false)
    expect(validLevels(['алкоголь'], { 'алкоголь': 4 })).toBe(false)
  })

  it('значение не целое — отказ', () => {
    expect(validLevels(['алкоголь'], { 'алкоголь': 1.5 })).toBe(false)
  })

  it('максимум — свой на тег: у игр 4 ступени (4 — ок, 5 — отказ), а не общий для всех тегов максимум', () => {
    // мутант с общим максимумом (например 3 для всех тегов LEVELS) здесь бы выжил на «игры»: 4 проходил бы как false
    expect(validLevels(['игры'], { 'игры': 4 })).toBe(true)
    expect(validLevels(['игры'], { 'игры': 5 })).toBe(false)
  })

  it('несколько тегов сразу — каждый проверяется в своём диапазоне', () => {
    expect(validLevels(['алкоголь', 'игры'], { 'алкоголь': 3, 'игры': 4 })).toBe(true)
    // алкоголь — максимум 3: 4 здесь вне диапазона именно для алкоголя, хотя для игр было бы ок
    expect(validLevels(['алкоголь', 'игры'], { 'алкоголь': 4, 'игры': 4 })).toBe(false)
  })
})
