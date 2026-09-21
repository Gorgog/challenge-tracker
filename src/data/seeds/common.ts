import type { Challenge, DayLog, DayStart, EntryMap, Tag } from '@/domain/types'

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
