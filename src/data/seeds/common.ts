import { addDays, dayKey, isoDow, parseDay } from '@/domain/date'
import { usualNight } from '@/domain/night'
import { dayOutcome } from '@/domain/streaks'
import { LEVELS } from '@/domain/tags'
import type { Challenge, DayLog, DayStart, EntryMap, Night, NightHow, Tag } from '@/domain/types'

/** Что насыпает сценарий демо: челленджи, отметки, итоги и начала дней, теги. */
export type Seed = {
  challenges: Challenge[]
  entries: Record<string, EntryMap>
  logs: DayLog[]
  starts: DayStart[]
  tags: Tag[]
}

/**
 * Отказ отвечают вечером (срез 5а): закрытый день без срыва — «Да, без» (1). Дни, которые не закрывали,
 * остаются без ответа — «не записано». Случайных чисел не берёт: последовательности сида не сдвигаются.
 */
export function answerQuits(challenges: Challenge[], entries: Record<string, EntryMap>, logs: DayLog[], today: Date) {
  for (const c of challenges.filter((x) => x.kind === 'quit')) {
    const map = (entries[c.id] ??= {})
    for (const { day } of logs) {
      if (map[day] === undefined && dayOutcome(c, map, parseDay(day), today) !== 'outside') map[day] = 1
    }
  }
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

/**
 * Новые теги и ступени (срез 5б) тянут числа из четвёртой последовательности: вечер, утро и ночь не
 * сдвигаются (отпечатки — в seeds/evening.test.ts).
 */
export const doseStream = (seed: number) => mulberry32(seed ^ 0x9e3779b9)

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

/** Новые теги (срез 5б) — доля вечеров в будни и в выходные. На оценки не влияют: фон для аналитики. */
const BACKGROUND_TAGS: readonly (readonly [tag: string, weekday: number, weekend: number])[] = [
  ['игры', 0.15, 0.35],
  ['стресс', 0.15, 0.05],
  ['работа допоздна', 0.12, 0],
]

/** Доля вечеров с алкоголем без ступени — «было, сколько — не указано». */
const ALCOHOL_UNSPECIFIED = 0.15

/**
 * Ступень алкоголя — по уже посчитанному утру D+1: чем ниже самочувствие против обычного (среднее записанных
 * утр), тем выше ступень; `noise` сдвигает на ±1 балл, чтобы связь не была ровной. Утра нет — ступень наугад.
 */
function alcoholLevel(next: number | undefined, usual: number, noise: number): number {
  if (next === undefined) return 1 + Math.floor(noise * 3)
  const drop = usual - next + (noise - 0.5) * 2
  return drop >= 4 ? 3 : drop >= 2 ? 2 : 1
}

/**
 * Новые теги и ступени в закрытых итогах (срез 5б) — поверх готовой истории, поэтому оценки, заметки, прежние
 * теги, утро и ночь те же. Игры, стресс и работа допоздна — фон со случайной ступенью. Ступень алкоголя
 * связана с утром после него (`alcoholLevel`), часть вечеров — без ступени. Числа тянутся одинаковым числом на
 * каждый итог, что бы ни выпало: соседние дни не сдвигаются.
 */
export function withDoses(logs: DayLog[], starts: DayStart[], seed: number): DayLog[] {
  const rnd = doseStream(seed)
  const wellbeingOn = new Map(starts.flatMap((s) => (s.morning ? [[s.day, s.morning.wellbeing] as const] : [])))
  const recorded = [...wellbeingOn.values()]
  const usual = recorded.reduce((a, b) => a + b, 0) / recorded.length
  return [...logs]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((log) => {
      /* восемь чисел на итог: по два на новый тег (выпал ли, ступень), два на алкоголь (без ступени ли, шум) */
      const draws = BACKGROUND_TAGS.map(() => [rnd(), rnd()] as const)
      const bare = rnd()
      const noise = rnd()
      if (log.closedAt === null) return log
      const weekend = isoDow(parseDay(log.day)) >= 5
      const tags = [...log.tags]
      const levels: Record<string, number> = { ...log.levels }
      if (tags.includes('алкоголь') && bare >= ALCOHOL_UNSPECIFIED) {
        levels['алкоголь'] = alcoholLevel(wellbeingOn.get(dayKey(addDays(parseDay(log.day), 1))), usual, noise)
      }
      BACKGROUND_TAGS.forEach(([tag, weekday, weekendChance], i) => {
        const [u, step] = draws[i]!
        if (u >= (weekend ? weekendChance : weekday)) return
        tags.push(tag)
        levels[tag] = 1 + Math.floor(step * LEVELS[tag]!.short.length)
      })
      return { ...log, tags, ...(Object.keys(levels).length > 0 ? { levels } : {}) }
    })
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
