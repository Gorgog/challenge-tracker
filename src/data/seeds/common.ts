import { addDays, dayKey, isoDow, parseDay } from '@/domain/date'
import { usualNight } from '@/domain/night'
import type { Challenge, DayLog, DayStart, EntryMap, Night, NightHow, Tag } from '@/domain/types'

/** Что насыпает сценарий демо: челленджи, отметки, итоги и начала дней, теги. */
export type Seed = {
  challenges: Challenge[]
  entries: Record<string, EntryMap>
  logs: DayLog[]
  starts: DayStart[]
  tags: Tag[]
}

export const NOTES = {
  high: [
    'Хороший день. Успел и поработать, и погулять.',
    'Наконец-то разгрёб хвосты — дышится легче.',
    'Редкий день, когда всё по плану.',
    'Утро задалось, и дальше по накатанной.',
  ],
  mid: [
    'Обычный день, ничего особенного.',
    'Половину задач сделал, половину перенёс.',
    'Вечером сил уже не было, но день нормальный.',
    'Всё ровно, без взлётов.',
  ],
  low: [
    'Тяжело. Весь день как в тумане.',
    'Ничего не успел, злюсь на себя.',
    'Опять лёг под утро — весь день сломан.',
    'Много суеты, толку ноль.',
  ],
  tagged: {
    дедлайн: 'Весь день в задаче, к вечеру выжат.',
    болел: 'Провалялся с температурой.',
    ссора: 'Поругались вечером, настроение на нуле.',
    дорога: 'Полдня в пути, вымотался.',
    алкоголь: 'Посидели с друзьями — завтра будет тяжело.',
  } as Record<string, string>,
}

/** Генератор из прототипа: одно зерно — одна и та же история. */
export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Утро тянет числа из своей последовательности: основная не сдвигается, поэтому вечер, отметки и
 * приёмка методики остаются прежними (см. seeds/evening.test.ts).
 */
export const morningStream = (seed: number) => mulberry32(seed ^ 0x5bd1e995)

/**
 * Ночь (лёг, встал) тянет числа из третьей последовательности: утро и вечер не сдвигаются (отпечатки —
 * в seeds/evening.test.ts).
 */
export const nightStream = (seed: number) => mulberry32(seed ^ 0x27d4eb2d)

const step5 = (v: number) => Math.round(v / 5) * 5

/**
 * Ночь перед каждым записанным утром. Отбой около 23:20: позже после вечера с алкоголем (+1,5 ч) и дедлайном
 * (+1 ч), в ночь на субботу и воскресенье (+45 мин), перед плохим сном (+40 мин) и на `lateness(day)` минут —
 * сдвиг сценария. Подъём — через 7,5 ч, раньше перед плохим сном, не позже начала дня. Ответ «как обычно» —
 * когда время в 10 минутах от обычного за 14 дней (`usualNight`), как если бы нажали кнопку.
 */
export function withNights(starts: DayStart[], logs: DayLog[], seed: number, lateness: (day: string) => number = () => 0): DayStart[] {
  const rnd = nightStream(seed)
  const tagsOf = new Map(logs.map((l) => [l.day, l.tags]))
  const out: DayStart[] = []
  for (const s of [...starts].sort((a, b) => a.day.localeCompare(b.day))) {
    /* по два числа на каждый день, даже без утра: пропуск утра не сдвигает соседние ночи */
    const a = rnd()
    const b = rnd()
    if (!s.morning) {
      out.push(s)
      continue
    }
    const prevDay = addDays(parseDay(s.day), -1)
    const prev = tagsOf.get(dayKey(prevDay)) ?? []
    const bad = s.morning.sleep <= 4
    const started = new Date(s.startedAt)
    const startMin = started.getHours() * 60 + started.getMinutes()
    let wake = step5(
      Math.min(
        startMin - 5,
        -40 + (a - 0.5) * 70 + 450 + (b - 0.5) * 80 - (bad ? 45 : 0) + (prev.includes('алкоголь') ? 40 : 0),
      ),
    )
    let bed = step5(
      -40 +
        (a - 0.5) * 70 +
        (prev.includes('алкоголь') ? 90 : 0) +
        (prev.includes('дедлайн') ? 60 : 0) +
        (isoDow(prevDay) >= 4 && isoDow(prevDay) <= 5 ? 45 : 0) +
        (bad ? 40 : 0) +
        lateness(s.day),
    )
    bed = Math.max(-720, Math.min(bed, wake - 180))
    const usual = usualNight(out, s.day)
    let bedHow: NightHow = 'exact'
    let wakeHow: NightHow = 'exact'
    if (usual.bed !== null && Math.abs(bed - usual.bed) <= 10 && usual.bed <= wake - 180) {
      bed = usual.bed
      bedHow = 'usual'
    }
    if (usual.wake !== null && Math.abs(wake - usual.wake) <= 10 && usual.wake <= startMin - 5 && usual.wake - bed >= 180) {
      wake = usual.wake
      wakeHow = 'usual'
    }
    const night: Night = { bed, wake, bedHow, wakeHow }
    out.push({ ...s, morning: { ...s.morning, night } })
  }
  return out
}

/** Доля утр, которые пропускают. */
export const SKIP_MORNING = 0.12

/** Шум утренней оценки: заметно больше вечернего — утром себя оценивают грубее. Среднее как у вечера. */
export const morningNoise = (rnd: () => number) => rnd() * 3.5 - 1.15

/** Сон: после недосыпа 1–4, иначе 5–9. */
export const sleepScore = (short: boolean, rnd: () => number) =>
  short ? 1 + Math.floor(rnd() * 4) : 5 + Math.floor(rnd() * 5)

/** Время начала дня в сиде — с 7 до 11 утра по местному времени. */
export const startedAt = (date: Date, rnd: () => number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7 + Math.floor(rnd() * 4), Math.floor(rnd() * 60)).toISOString()
