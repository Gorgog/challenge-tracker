import { describe, expect, it } from 'vitest'
import { createDemoRepo, type DemoScenario } from '@/data/demoRepo'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { validNight } from '@/domain/night'

/**
 * Охрана вечера. Утро в сидах берёт числа из своей случайной последовательности, а сон — из той
 * же величины, из которой раньше выпадал тег «мало спал». Поэтому вечерние оценки, заметки, теги
 * (кроме «мало спал») и прошлые отметки обязаны остаться прежними: на них держится приёмка методики,
 * и её частоты сравнимы с прежними. Сегодняшние отметки не в счёт: в демо день ещё не начат, и их
 * нет. Отпечатки сняты на коде до появления утра.
 */
const TODAY = parseDay('2026-09-21')

/** FNV-1a: короткий отпечаток длинной строки. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

async function evening(scenario: DemoScenario, seed: number): Promise<string> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario })
  const [all, stored, logs] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  /* «Ложусь раньше» (срез 4б) — без своих отметок и случайных чисел: отпечаток — по остальным, он прежний */
  const challenges = all.filter((c) => c.measure !== 'bedtime')
  const entries = Object.fromEntries(Object.entries(stored).filter(([id]) => challenges.some((c) => c.id === id)))
  const past = Object.fromEntries(
    Object.entries(entries).map(([id, map]) => [
      id,
      Object.fromEntries(Object.entries(map).filter(([day]) => day !== dayKey(TODAY))),
    ]),
  )
  return fingerprint(
    JSON.stringify({
      challenges: challenges.map((c) => [c.id, c.startDate, c.lengthDays, c.pauses]),
      entries: past,
      logs: logs.map((l) => [
        l.day,
        l.mood,
        l.wellbeing,
        l.productivity,
        l.tags.filter((t) => t !== 'мало спал'),
        l.note,
        l.closedAt,
      ]),
    }),
  )
}

describe('утро не меняет вечер в демо', () => {
  it.each([
    ['full', 20260921, '9e03883f'],
    ['full', 20266840, 'f4c3ddb8'],
    ['full', 424242, '382023ce'],
    ['burnout', 20260921, '02c4804e'],
    ['burnout', 20266840, '2e7ffffe'],
    ['burnout', 424242, 'd5974460'],
  ] as const)('%s, зерно %s — вечерние данные те же', async (scenario, seed, expected) => {
    expect(await evening(scenario, seed)).toBe(expected)
  })
})

/**
 * Охрана утра. Ночь (лёг, встал) берёт числа из своей последовательности (`nightStream`): утренние оценки и
 * время начала дня остаются прежними. Отпечатки совпадали с кодом до появления ночи (24.09); начало дня в них —
 * местные часы и минуты, чтобы не зависеть от пояса машины.
 */
const minutesAt = (iso: string) => new Date(iso).getHours() * 60 + new Date(iso).getMinutes()

async function mornings(scenario: DemoScenario, seed: number) {
  return createDemoRepo({ today: TODAY, seed, storage: null, scenario }).listDayStarts()
}

describe('ночь не меняет утро в демо', () => {
  it.each([
    ['full', 20260921, '01ae6cb6'],
    ['full', 20266840, '4b8b5e21'],
    ['full', 424242, '1a041b3a'],
    ['burnout', 20260921, '73849931'],
    ['burnout', 20266840, 'd4faa0f0'],
    ['burnout', 424242, '7b3b4f04'],
  ] as const)('%s, зерно %s — утренние оценки и начало дня те же', async (scenario, seed, expected) => {
    const starts = await mornings(scenario, seed)
    /* начало дня — местные часы и минуты: сид строит его из местного времени, а ISO зависит от пояса машины (CI — UTC) */
    const text = JSON.stringify(starts.map((s) => [s.day, minutesAt(s.startedAt), s.morning && [s.morning.sleep, s.morning.wellbeing, s.morning.mood]]))
    expect(fingerprint(text)).toBe(expected)
  })
})

const SEEDS = [20260921, 20266840, 424242]
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

describe('ночь в демо', () => {
  it.each(['full', 'burnout'] as const)('%s: ночь у записанных утр — по правилам базы, подъём не позже начала дня', async (scenario) => {
    for (const seed of SEEDS) {
      const starts = await mornings(scenario, seed)
      const withMorning = starts.filter((s) => s.morning)
      const nights = withMorning.filter((s) => s.morning!.night)
      expect(nights.length, String(seed)).toBeGreaterThanOrEqual(withMorning.length * 0.8)
      for (const s of nights) {
        const n = s.morning!.night!
        expect(validNight(n), `${seed} ${s.day}`).toBe(true)
        expect(n.wake, `${seed} ${s.day}`).toBeLessThanOrEqual(minutesAt(s.startedAt))
        expect(n.wake - n.bed, `${seed} ${s.day}`).toBeGreaterThanOrEqual(180)
      }
    }
  })

  it.each(['full', 'burnout'] as const)('%s: ответы и «как обычно», и точным временем', async (scenario) => {
    const hows = (await mornings(scenario, 20260921)).flatMap((s) => (s.morning?.night ? [s.morning.night.bedHow, s.morning.night.wakeHow] : []))
    expect(hows).toContain('usual')
    expect(hows).toContain('exact')
  })

  it('full: после вечера с алкоголем ложится заметно позже — связь, заложенная в сид', async () => {
    for (const seed of SEEDS) {
      const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario: 'full' })
      const [starts, logs] = await Promise.all([r.listDayStarts(), r.listDayLogs()])
      const tagsOf = new Map(logs.map((l) => [l.day, l.tags]))
      const after: number[] = []
      const other: number[] = []
      for (const s of starts) {
        const n = s.morning?.night
        const prev = tagsOf.get(dayKey(addDays(parseDay(s.day), -1)))
        if (!n || !prev) continue
        ;(prev.includes('алкоголь') ? after : other).push(n.bed)
      }
      expect(after.length, String(seed)).toBeGreaterThanOrEqual(5)
      expect(avg(after) - avg(other), String(seed)).toBeGreaterThanOrEqual(45)
    }
  })

  it('burnout: выбираясь из выгорания, ложится раньше — «начал иногда нормально спать»', async () => {
    for (const seed of SEEDS) {
      const beds = (await mornings('burnout', seed)).flatMap((s) => (s.morning?.night ? [s.morning.night.bed] : []))
      expect(avg(beds.slice(0, 8)) - avg(beds.slice(-8)), String(seed)).toBeGreaterThanOrEqual(30)
    }
  })
})

describe('«Ложусь раньше» в демо (срез 4б)', () => {
  it.each(SEEDS)('full, зерно %s: челлендж «Время» есть, своих отметок у него нет — только ночи в утрах', async (seed) => {
    const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario: 'full' })
    const [challenges, entries, starts] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayStarts()])
    const bed = challenges.find((c) => c.measure === 'bedtime')!
    expect(bed).toMatchObject({ name: 'Ложусь раньше', kind: 'do', goal: -30 })
    expect(entries[bed.id] ?? {}).toEqual({})
    // ночей хватает, чтобы было и «до 23:30», и «позже»
    const beds = starts.filter((s) => s.day >= bed.startDate && s.morning?.night).map((s) => s.morning!.night!.bed)
    expect(beds.some((b) => b <= bed.goal)).toBe(true)
    expect(beds.some((b) => b > bed.goal)).toBe(true)
  })
})
