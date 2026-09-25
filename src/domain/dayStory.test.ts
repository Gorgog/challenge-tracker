import { describe, expect, it } from 'vitest'
import { dayStory } from './dayStory'
import type { Link, Links } from './links'
import type { Band } from './overview'
import type { TimelineDay } from './timeline'

const BAND: Band = { kind: 'band', low: 6, high: 8, days: 20, short: false }

const day = (d: string, p: Partial<TimelineDay> = {}): TimelineDay => ({
  day: d,
  morning: { sleep: 7, wellbeing: 7, mood: 7, night: { bed: -30, wake: 460, bedHow: 'exact', wakeHow: 'exact' } },
  started: true,
  evening: { mood: 7, wellbeing: 7, productivity: 6 },
  tags: [],
  ...p,
})

/** Вечер 18-го с алкоголем, ночь до 1:45, плохое утро и вечер 19-го. */
function bad(p: Partial<TimelineDay> = {}): TimelineDay[] {
  return [
    day('2026-09-18', { tags: ['алкоголь'], levels: { алкоголь: 3 }, evening: { mood: 8, wellbeing: 7, productivity: 6 } }),
    day('2026-09-19', {
      morning: { sleep: 9, wellbeing: 1, mood: 3, night: { bed: 105, wake: 490, bedHow: 'exact', wakeHow: 'exact' }, note: 'Голова раскалывается' },
      evening: { mood: 4, wellbeing: 0, productivity: 0 },
      tags: ['дорога'],
      note: 'Весь день лежал',
      ...p,
    }),
  ]
}

const link = (factor: Link['factor'], level: Link['level'], direction: Link['direction'], diff = 2, bucket: Link['bucket'] = null): Link => ({
  factor,
  withDays: [],
  withN: 6,
  withoutN: 40,
  withMean: direction === 'better' ? 7 + diff : 7 - diff,
  withoutMean: 7,
  level,
  direction,
  sameSide: 5,
  shrunk: diff,
  otherwise: null,
  bucket,
})
const linksOf = (...pairs: Link[]): Links => ({
  gate: { ok: true, recorded: 50, closedShare: 1 },
  pairs,
  cards: [],
  night: null,
  late: null,
  checked: pairs.length,
  found: 0,
})
const NONE = linksOf()
/** Обычный отбой 23:30; поздний — с 00:30. */
const NIGHT = { usualBed: -30, lateFrom: 30 }

describe('dayStory — лента дня в шторке (решение Georgy 25.09)', () => {
  it('итог — точка графика по цели и где она против полосы «обычно»', () => {
    const s = dayStory(bad(), 1, 'all', BAND, NONE, NIGHT)
    expect(s.value).toBe(2)
    expect(s.tone).toBe('worse')
    expect(s.band).toEqual({ low: 6, high: 8 })
  })

  it('вечер накануне — его оценка по цели и теги со ступенями; ночь — на сколько позже обычного и поздняя ли', () => {
    const s = dayStory(bad(), 1, 'all', BAND, NONE, NIGHT)
    expect(s.before).toEqual({ value: 7.5, tags: ['алкоголь'], levels: { алкоголь: 3 }, harmful: ['алкоголь'] })
    expect(s.night).toEqual({ bed: 105, wake: 490, later: 135, late: true })
  })

  it('утро и вечер — оценки по цели и заметки; теги вечера — этого дня', () => {
    const s = dayStory(bad(), 1, 'all', BAND, NONE, NIGHT)
    expect(s.morning).toEqual({ value: 2, note: 'Голова раскалывается' })
    expect(s.evening).toEqual({ value: 2, tags: ['дорога'], note: 'Весь день лежал' })
  })

  it('цель «Сон»: у утра — сон, у вечера числа нет; «Продуктивность» — наоборот', () => {
    const sleep = dayStory(bad(), 1, 'sleep', BAND, NONE, NIGHT)
    expect(sleep.morning!.value).toBe(9)
    expect(sleep.evening!.value).toBeNull()
    const work = dayStory(bad(), 1, 'productivity', BAND, NONE, NIGHT)
    expect(work.morning!.value).toBeNull()
    expect(work.evening!.value).toBe(0)
    expect(work.before!.value).toBe(6)
  })

  it('накануне вечер не закрыт или его нет в окне — «before» пусто; ночь без записи — пусто; обычного отбоя нет — «позже» неизвестно', () => {
    const [prev, d] = bad()
    expect(dayStory([{ ...prev!, evening: null, tags: [] }, d!], 1, 'all', BAND, NONE, NIGHT).before).toBeNull()
    expect(dayStory([d!], 0, 'all', BAND, NONE, NIGHT).before).toBeNull()
    const noNight = dayStory([prev!, { ...d!, morning: { ...d!.morning!, night: null } }], 1, 'all', BAND, NONE, NIGHT)
    expect(noNight.night).toBeNull()
    expect(dayStory(bad(), 1, 'all', BAND, NONE, { usualBed: null, lateFrom: null }).night).toEqual({ bed: 105, wake: 490, later: null, late: false })
  })

  it('догадка: найденная связь с тем, что было накануне, — сильнейшая', () => {
    const links = linksOf(
      link({ kind: 'tag', tag: 'алкоголь' }, 'maybe', 'worse', 2),
      link({ kind: 'lateBed', from: 30 }, 'notable', 'worse', 1.2),
      link({ kind: 'tag', tag: 'ссора' }, 'notable', 'worse', 3),
    )
    // ссоры накануне не было — её связь не при чём; ●●○ сильнее ●○○
    expect(dayStory(bad(), 1, 'all', BAND, links, NIGHT).guess).toEqual({ kind: 'link', factor: { kind: 'lateBed', from: 30 }, level: 'notable', direction: 'worse' })
  })

  it('догадка: связь «пока рано» или «не видно» — не связь; вредное накануне — «совпадение»', () => {
    const links = linksOf(link({ kind: 'tag', tag: 'алкоголь' }, 'early', null), link({ kind: 'lateBed', from: 30 }, 'none', null))
    // «дорога» в этот день была бы «не в моих силах» — убираем, чтобы проверить именно совпадение
    expect(dayStory(bad({ tags: [] }), 1, 'all', BAND, links, NIGHT).guess).toEqual({ kind: 'coincidence', what: [{ kind: 'tag', tag: 'алкоголь' }, { kind: 'lateBed' }] })
  })

  it('догадка: «не в моих силах» в этот день или накануне — прежде совпадений', () => {
    const s = dayStory(bad({ tags: ['болел', 'дорога'] }), 1, 'all', BAND, NONE, NIGHT)
    expect(s.guess).toEqual({ kind: 'context', tags: ['болел', 'дорога'] })
  })

  it('догадка: плохой день без всего — «явной причины нет»; день как обычно — догадки нет', () => {
    const [prev, d] = bad({ tags: [] })
    const plain = [{ ...prev!, tags: [], levels: undefined }, { ...d!, morning: { ...d!.morning!, night: { bed: -20, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const } } }]
    expect(dayStory(plain, 1, 'all', BAND, NONE, NIGHT).guess).toEqual({ kind: 'none' })
    expect(dayStory([day('2026-09-18'), day('2026-09-19')], 1, 'all', BAND, NONE, NIGHT).guess).toBeNull()
  })

  it('день лучше обычного: только найденная связь «к лучшему»; вредное или ничего — без догадки о причине', () => {
    const good = [day('2026-09-18', { tags: ['отдых'] }), day('2026-09-19', { morning: { sleep: 9, wellbeing: 9, mood: 10 }, evening: { mood: 9, wellbeing: 10, productivity: 8 } })]
    expect(dayStory(good, 1, 'all', BAND, linksOf(link({ kind: 'tag', tag: 'отдых' }, 'maybe', 'better', 2, 'more')), NIGHT).guess).toEqual({
      kind: 'link',
      factor: { kind: 'tag', tag: 'отдых' },
      level: 'maybe',
      direction: 'better',
    })
    expect(dayStory(good, 1, 'all', BAND, NONE, NIGHT).guess).toBeNull()
  })

  it('связь «плохая ночь → вечер» — когда сон этого утра плохой', () => {
    const [prev, d] = bad()
    const poor = [prev!, { ...d!, morning: { ...d!.morning!, sleep: 2 } }]
    const links = linksOf(link({ kind: 'badSleep' }, 'maybe', 'worse', 3), link({ kind: 'tag', tag: 'алкоголь' }, 'maybe', 'worse', 1))
    expect(dayStory(poor, 1, 'all', BAND, links, NIGHT).guess).toEqual({ kind: 'link', factor: { kind: 'badSleep' }, level: 'maybe', direction: 'worse' })
  })

  it('день лучше: связь «к лучшему» без ведра «Больше» (алкоголь, поздний отбой, дедлайн) — не догадка (ревью Opus 25.09)', () => {
    const good = (tags: string[], bed = -30) => [
      day('2026-09-18', { tags }),
      day('2026-09-19', {
        morning: { sleep: 9, wellbeing: 9, mood: 10, night: { bed, wake: 460, bedHow: 'exact', wakeHow: 'exact' } },
        evening: { mood: 9, wellbeing: 10, productivity: 8 },
      }),
    ]
    expect(dayStory(good(['алкоголь']), 1, 'all', BAND, linksOf(link({ kind: 'tag', tag: 'алкоголь' }, 'maybe', 'better')), NIGHT).guess).toBeNull()
    expect(dayStory(good(['дедлайн']), 1, 'all', BAND, linksOf(link({ kind: 'tag', tag: 'дедлайн' }, 'notable', 'better')), NIGHT).guess).toBeNull()
    expect(dayStory(good([], 60), 1, 'all', BAND, linksOf(link({ kind: 'lateBed', from: 30 }, 'maybe', 'better')), NIGHT).guess).toBeNull()
  })

  it('день хуже: связь в обратную сторону («к лучшему») при том же факторе — не довод', () => {
    const links = linksOf(link({ kind: 'tag', tag: 'алкоголь' }, 'notable', 'better', 3))
    expect(dayStory(bad({ tags: [] }), 1, 'all', BAND, links, NIGHT).guess).toEqual({
      kind: 'coincidence',
      what: [{ kind: 'tag', tag: 'алкоголь' }, { kind: 'lateBed' }],
    })
  })

  it('«не в моих силах» накануне — тоже «не в моих силах», даже если по нему найдена связь', () => {
    const [prev, d] = bad({ tags: [] })
    const withIll = [{ ...prev!, tags: ['болел'] }, d!]
    const links = linksOf(link({ kind: 'tag', tag: 'болел' }, 'maybe', 'worse', 3))
    expect(dayStory(withIll, 1, 'all', BAND, links, NIGHT).guess).toEqual({ kind: 'context', tags: ['болел'] })
  })

  it('цель «Сон»: плохой сон — это и есть плохой день, в подозреваемые не идёт (ревью Opus 25.09)', () => {
    const d = day('2026-09-19', { morning: { sleep: 2, wellbeing: 6, mood: 6, night: { bed: -30, wake: 460, bedHow: 'exact', wakeHow: 'exact' } } })
    expect(dayStory([day('2026-09-18'), d], 1, 'sleep', BAND, NONE, NIGHT).guess).toEqual({ kind: 'none' })
  })

  it('границы: отбой ровно в порог — поздний; сон ровно 4 — плохой; тег «только Меньше» — вредный', () => {
    const at = (bed: number, sleep: number, tags: string[] = []) => [
      day('2026-09-18', { tags }),
      day('2026-09-19', {
        morning: { sleep, wellbeing: 2, mood: 2, night: { bed, wake: 460, bedHow: 'exact', wakeHow: 'exact' } },
        evening: { mood: 2, wellbeing: 2, productivity: 2 },
      }),
    ]
    expect(dayStory(at(30, 7), 1, 'all', BAND, NONE, NIGHT).night!.late).toBe(true)
    expect(dayStory(at(30, 7), 1, 'all', BAND, linksOf(link({ kind: 'lateBed', from: 30 }, 'maybe', 'worse')), NIGHT).guess).toEqual({
      kind: 'link',
      factor: { kind: 'lateBed', from: 30 },
      level: 'maybe',
      direction: 'worse',
    })
    expect(dayStory(at(-30, 4), 1, 'all', BAND, NONE, NIGHT).guess).toEqual({ kind: 'coincidence', what: [{ kind: 'badSleep' }] })
    expect(dayStory(at(-30, 4), 1, 'all', BAND, linksOf(link({ kind: 'badSleep' }, 'maybe', 'worse')), NIGHT).guess).toMatchObject({ kind: 'link' })
    expect(dayStory(at(-30, 7, ['игры']), 1, 'all', BAND, NONE, NIGHT).before!.harmful).toEqual(['игры'])
  })

  it('неполный день (только утро) — итога против полосы и догадки нет', () => {
    const [prev, d] = bad()
    const s = dayStory([prev!, { ...d!, evening: null, tags: [], note: undefined }], 1, 'all', BAND, NONE, NIGHT)
    expect(s.tone).toBeNull()
    expect(s.guess).toBeNull()
    expect(s.evening).toBeNull()
  })

  it('полосы ещё нет — тона нет, догадки нет', () => {
    const s = dayStory(bad(), 1, 'all', { kind: 'none', need: 5 }, NONE, NIGHT)
    expect(s.tone).toBeNull()
    expect(s.band).toBeNull()
    expect(s.guess).toBeNull()
  })
})
