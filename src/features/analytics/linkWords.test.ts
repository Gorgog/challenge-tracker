import { describe, expect, it } from 'vitest'
import type { Ladder, Link } from '@/domain/links'
import { caseLine, earlyNote, ladderText, linkBasis, linkLine, linkTitle, otherwiseText, sheetTitle } from './linkWords'

const drink: Link = {
  factor: { kind: 'tag', tag: 'алкоголь' },
  withDays: [],
  withN: 8,
  withoutN: 38,
  withMean: 4.2,
  withoutMean: 7,
  level: 'maybe',
  direction: 'worse',
  sameSide: 7,
  shrunk: -2.5,
  otherwise: null,
  bucket: 'less',
}
const sleepLink: Link = { ...drink, factor: { kind: 'badSleep' }, bucket: null, withN: 6, sameSide: 5 }

describe('linkWords — связь словами', () => {
  it('строка карточки: что было после, без чего, в скольких разах', () => {
    expect(linkLine(drink, 'sleep')).toBe('Сон утром после «алкоголь» — 4,2, без — 7,0. Хуже в 7 из 8 раз.')
    expect(linkLine(drink, 'all')).toBe('Самочувствие и настроение утром после «алкоголь» — 4,2, без — 7,0. Хуже в 7 из 8 раз.')
    expect(linkLine(drink, 'productivity')).toBe('Продуктивность на следующий день после «алкоголь» — 4,2, без — 7,0. Хуже в 7 из 8 раз.')
    expect(linkLine({ ...drink, direction: 'better', withN: 1, sameSide: 1 }, 'mood')).toBe(
      'Настроение утром после «алкоголь» — 4,2, без — 7,0. Лучше в 1 из 1 раза.',
    )
    expect(linkLine(sleepLink, 'all')).toBe('Самочувствие и настроение вечером после плохой ночи — 4,2, без — 7,0. Хуже в 5 из 6 раз.')
  })

  it('заголовок в списке и в карточке — со временем и без «из-за»', () => {
    expect(linkTitle(drink)).toBe('«алкоголь» вечером')
    expect(linkTitle(sleepLink)).toBe('Плохая ночь')
    expect(sheetTitle(drink, 'sleep')).toBe('После вечера с «алкоголь» сон на следующее утро обычно хуже')
    expect(sheetTitle({ ...drink, direction: 'better' }, 'productivity')).toBe(
      'После вечера с «алкоголь» продуктивность на следующий день обычно лучше',
    )
    expect(sheetTitle(sleepLink, 'mood')).toBe('После плохой ночи настроение вечером обычно хуже')
  })

  it('на чём держится: ступень словами', () => {
    expect(linkBasis(drink)).toBe('8 раз «с» и 38 «без». Может быть и случайно.')
    expect(linkBasis({ ...drink, level: 'notable' })).toBe('8 раз «с», в обеих половинах периода — в ту же сторону.')
  })

  it('«а может быть иначе»: совпавший тег и выходные', () => {
    expect(otherwiseText({ ...drink, otherwise: { kind: 'tag', tag: 'дедлайн', together: 5, of: 8, diff: -2.1 } })).toBe(
      'А может быть иначе: 5 из 8 раз это был ещё и вечер с «дедлайн». Без таких вечеров разница 2,1.',
    )
    expect(otherwiseText({ ...drink, otherwise: { kind: 'tag', tag: 'дедлайн', together: 7, of: 8, diff: null } })).toBe(
      'А может быть иначе: 7 из 8 раз это был ещё и вечер с «дедлайн» — разделить их пока нельзя.',
    )
    // причину не называем: «разницы почти нет» — и всё
    expect(otherwiseText({ ...drink, otherwise: { kind: 'tag', tag: 'дедлайн', together: 6, of: 8, diff: 0.3 } })).toBe(
      'А может быть иначе: 6 из 8 раз это был ещё и вечер с «дедлайн». Без таких вечеров разницы почти нет.',
    )
    // без совпавшего тега — в другую сторону: так и сказано, число не противоречит словам
    expect(otherwiseText({ ...drink, otherwise: { kind: 'tag', tag: 'дедлайн', together: 6, of: 8, diff: 1 } })).toBe(
      'А может быть иначе: 6 из 8 раз это был ещё и вечер с «дедлайн». Без таких вечеров — наоборот: на 1,0 в другую сторону.',
    )
    expect(otherwiseText({ ...sleepLink, otherwise: { kind: 'tag', tag: 'алкоголь', together: 4, of: 6, diff: null } })).toBe(
      'А может быть иначе: 4 из 6 раз накануне был вечер с «алкоголь» — разделить их пока нельзя.',
    )
    expect(otherwiseText({ ...drink, otherwise: { kind: 'weekend', together: 5, of: 8, diff: -2.1 } })).toBe(
      'А может быть иначе: 5 из 8 раз это была суббота или воскресенье — выходные и так бывают другими. С поправкой на выходные разница 2,1.',
    )
    expect(otherwiseText(drink)).toBeNull()
  })

  it('«пока рано»: вредное не зовём, остальному — сколько не хватает', () => {
    expect(earlyNote({ ...drink, level: 'early', withN: 2, withoutN: 30 })).toBe('«алкоголь» звать не будем — это просто счётчик.')
    expect(earlyNote({ ...sleepLink, level: 'early', withN: 2 })).toBe('Плохие ночи звать не будем — это просто счётчик.')
    const rest: Link = { ...drink, factor: { kind: 'tag', tag: 'отдых' }, level: 'early', withN: 4, withoutN: 30 }
    expect(earlyNote(rest)).toBe('До связи с «отдых» не хватает 1 дня «с».')
    expect(earlyNote({ ...rest, withN: 2 })).toBe('До связи с «отдых» не хватает 3 дней «с».')
    expect(earlyNote({ ...rest, withN: 30, withoutN: 3 })).toBe('До связи с «отдых» не хватает 2 дней «без».')
  })
})

describe('linkWords — поздний отбой (срез 4)', () => {
  const late: Link = { ...drink, factor: { kind: 'lateBed', from: 30 }, withN: 9, sameSide: 7, withMean: 5.2, withoutMean: 6.8 }

  it('заголовок — с порогом, как ряд «лёг 00:30+»; строка — утро после поздней ночи', () => {
    expect(linkTitle(late)).toBe('Поздний отбой (с 00:30)')
    expect(linkTitle({ ...late, factor: { kind: 'lateBed', from: -15 } })).toBe('Поздний отбой (с 23:45)')
    expect(linkLine(late, 'sleep')).toBe('Сон утром после позднего отбоя — 5,2, без — 6,8. Хуже в 7 из 9 раз.')
    expect(linkLine(late, 'productivity')).toBe('Продуктивность на следующий день после позднего отбоя — 5,2, без — 6,8. Хуже в 7 из 9 раз.')
  })

  it('карточка связи: заголовок словами «Что изменилось» — «с 00:30 и позже»', () => {
    expect(sheetTitle(late, 'sleep')).toBe('После отбоя с 00:30 и позже сон обычно хуже')
    expect(sheetTitle(late, 'all')).toBe('После отбоя с 00:30 и позже самочувствие и настроение утром обычно хуже')
    expect(sheetTitle(late, 'productivity')).toBe('После отбоя с 00:30 и позже продуктивность на следующий день обычно хуже')
  })

  it('«а может быть иначе» — вечер перед поздней ночью; «пока рано» — не зовём, это счётчик', () => {
    expect(otherwiseText({ ...late, otherwise: { kind: 'tag', tag: 'алкоголь', together: 6, of: 9, diff: -0.9 } })).toBe(
      'А может быть иначе: 6 из 9 раз это был ещё и вечер с «алкоголь». Без таких вечеров разница 0,9.',
    )
    expect(earlyNote({ ...late, level: 'early', withN: 2 })).toBe('Поздний отбой звать не будем — это просто счётчик.')
  })
})

describe('caseLine — случаи без обобщения', () => {
  it('один, два и несколько случаев; целые — без запятой; сравнение — с другими вечерами, а не с полосой', () => {
    expect(caseLine({ tag: 'ссора', values: [3], days: [], usual: 7, missing: 0 }, 'sleep')).toBe(
      'Единственное утро после «ссора» сон — 3. После других вечеров — около 7.',
    )
    expect(caseLine({ tag: 'ссора', values: [3, 4], days: [], usual: 6, missing: 0 }, 'all')).toBe(
      'Оба утра после «ссора» самочувствие и настроение — 3 и 4. После других вечеров — около 6.',
    )
    expect(caseLine({ tag: 'ссора', values: [3, 4, 2.5], days: [], usual: 6.5, missing: 0 }, 'productivity')).toBe(
      'Все 3 дня после «ссора» продуктивность — 3, 4 и 2,5. После других вечеров — около 6,5.',
    )
    expect(caseLine({ tag: 'ссора', values: [1], days: [], usual: 6, missing: 0 }, 'productivity')).toBe(
      'Единственный день после «ссора» продуктивность — 1. После других вечеров — около 6.',
    )
  })

  it('неотмеченные дни после тега названы, а «оба» — только о записанных', () => {
    expect(caseLine({ tag: 'ссора', values: [2, 2], days: [], usual: 6, missing: 1 }, 'all')).toBe(
      'Оба записанных утра после «ссора» самочувствие и настроение — 2 и 2. После других вечеров — около 6. Ещё 1 раз утро не отмечено.',
    )
    expect(caseLine({ tag: 'ссора', values: [2, 3, 1], days: [], usual: 6, missing: 1 }, 'sleep')).toBe(
      'Все 3 записанных утра после «ссора» сон — 2, 3 и 1. После других вечеров — около 6. Ещё 1 раз утро не отмечено.',
    )
    expect(caseLine({ tag: 'ссора', values: [2], days: [], usual: 6, missing: 2 }, 'productivity')).toBe(
      'Единственный записанный день после «ссора» продуктивность — 2. После других вечеров — около 6. Ещё 2 раза вечер не закрыт.',
    )
  })

  // срез 5б: тег из LEVELS со ступенью — подпись короткой формой («алкоголь · 6+»), остальное как обычно
  it('тег со ступенью — короткая подпись в кавычках: «алкоголь · 6+»', () => {
    expect(caseLine({ tag: 'алкоголь', level: 3, values: [3, 4], days: [], usual: 7, missing: 0 }, 'all')).toBe(
      'Оба утра после «алкоголь · 6+» самочувствие и настроение — 3 и 4. После других вечеров — около 7.',
    )
    // без ступени (level не задан) — как было, без «· …»
    expect(caseLine({ tag: 'алкоголь', values: [3], days: [], usual: 7, missing: 0 }, 'sleep')).toBe(
      'Единственное утро после «алкоголь» сон — 3. После других вечеров — около 7.',
    )
  })
})

describe('ladderText — фраза лесенки (срез 5б)', () => {
  // реалистичная лесенка «алкоголь» (3 ступени): «не было» n = 31, ступень 1 (1–2) n = 5 (≥ LADDER_MIN),
  // ступень 2 (3–5) n = 4, ступень 3 (6+) n = 3, «не указано» n = 2; с тегом 5 + 4 + 3 + 2 = 14 ≥ LADDER_TOTAL.
  // Ступень 1 от «не было» на 6,5 − 5,4 = 1,1 ≥ LINK_DIFF — при trend «firstLikeNone» здесь false, как и по договору
  const base: Ladder = {
    tag: 'алкоголь',
    steps: [
      { level: 0, n: 31, mean: 6.5 },
      { level: 1, n: 5, mean: 5.4 },
      { level: 2, n: 4, mean: 5.0 },
      { level: 3, n: 3, mean: 4.0 },
      { level: null, n: 2, mean: null },
    ],
    trend: null,
    firstLikeNone: false,
  }

  it('trend null — фразы нет, даже с firstLikeNone', () => {
    expect(ladderText(base)).toBeNull()
    expect(ladderText({ ...base, firstLikeNone: true })).toBeNull()
  })

  it('trend «worse» без firstLikeNone — только «Чем больше — тем хуже.»', () => {
    expect(ladderText({ ...base, trend: 'worse' })).toBe('Чем больше — тем хуже.')
  })

  it('trend «better» без firstLikeNone — «Чем больше — тем лучше.»', () => {
    // «игры»: 4 ступени, средние растут, первая дальше «не было» на 1,2 — firstLikeNone false; с тегом 4 + 3 + 3 + 3 = 13
    const better: Ladder = {
      tag: 'игры',
      steps: [
        { level: 0, n: 25, mean: 6.0 },
        { level: 1, n: 4, mean: 7.2 },
        { level: 2, n: 3, mean: 7.6 },
        { level: 3, n: 3, mean: 8.1 },
        { level: 4, n: 3, mean: 8.6 },
      ],
      trend: 'better',
      firstLikeNone: false,
    }
    expect(ladderText(better)).toBe('Чем больше — тем лучше.')
  })

  it('firstLikeNone — дописывает длинную подпись первой ступени с заглавной буквы: «почти как без»', () => {
    // ступень 1 от «не было» на 6,5 − 5,9 = 0,6 < LINK_DIFF — firstLikeNone true
    const near: Ladder = { ...base, steps: base.steps.map((s) => (s.level === 1 ? { ...s, mean: 5.9 } : s)), trend: 'worse', firstLikeNone: true }
    expect(ladderText(near)).toBe('Чем больше — тем хуже. 1–2 порции — почти как без.')
    // «стресс»: длинная подпись первой ступени — «немного», с маленькой буквы; в фразе — с заглавной
    const stress: Ladder = {
      tag: 'стресс',
      steps: [
        { level: 0, n: 20, mean: 6.0 },
        { level: 1, n: 4, mean: 5.8 },
        { level: 2, n: 3, mean: 4.5 },
        { level: 3, n: 3, mean: 3.5 },
        // с тегом 4 + 3 + 3 + 2 = 12 = LADDER_TOTAL
        { level: null, n: 2, mean: null },
      ],
      trend: 'worse',
      firstLikeNone: true,
    }
    expect(ladderText(stress)).toBe('Чем больше — тем хуже. Немного — почти как без.')
  })

  it('firstLikeNone вместе с trend «better» — тоже дописывает подпись первой ступени', () => {
    // «игры»: 4 ступени, первая («<1 ч») почти как «не было»
    const games: Ladder = {
      tag: 'игры',
      steps: [
        { level: 0, n: 25, mean: 6.0 },
        { level: 1, n: 4, mean: 6.2 },
        { level: 2, n: 3, mean: 6.8 },
        { level: 3, n: 3, mean: 7.5 },
        { level: 4, n: 3, mean: 8.0 },
      ],
      trend: 'better',
      firstLikeNone: true,
    }
    expect(ladderText(games)).toBe('Чем больше — тем лучше. <1 ч — почти как без.')
  })
})
