import { addDays, dayKey, parseDay } from './date'
import type { DayStart, Night } from './types'

/*
 * Время ночи — минуты от полуночи утра, к которому оно записано (`Night` в types.ts). Отбой с полудня —
 * это вчера: 23:30 = −30. Те же границы держит база (миграция 20260925090000_night.sql).
 */

/** «Обычно» — середина ответов за столько дней до сегодня… */
export const NIGHT_USUAL_DAYS = 14
/** …если ответов хотя бы столько; меньше — кнопки «как обычно» нет. */
export const NIGHT_USUAL_MIN = 3
/** Обычное время округляется до стольких минут: как шаг поля времени. */
export const NIGHT_STEP = 5

const DAY = 1440
const HALF = 720

const wrap = (min: number) => ((min % DAY) + DAY) % DAY

/** «23:30», «7:40»; полночный час — «00:30», а не «0:30». */
export function clockText(min: number): string {
  const x = wrap(min)
  const h = Math.floor(x / 60)
  return `${h === 0 ? '00' : h}:${String(x % 60).padStart(2, '0')}`
}

/** Значение поля времени: «07:40». */
export function inputOf(min: number): string {
  const x = wrap(min)
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

const parse = (value: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Отбой из поля: с полудня — вчера (минус сутки). Пусто — null. */
export function bedFromInput(value: string): number | null {
  const t = parse(value)
  return t === null ? null : t >= HALF ? t - DAY : t
}

/** Подъём из поля: минуты от полуночи. Пусто — null. */
export const wakeFromInput = (value: string): number | null => parse(value)

/** Минуты часов от полуночи этого дня. */
export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes()

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

const step = (v: number) => Math.round(v / NIGHT_STEP) * NIGHT_STEP + 0

export type UsualNight = { bed: number | null; wake: number | null }

/**
 * Обычный отбой и подъём — медиана ответов за `NIGHT_USUAL_DAYS` дней до `today` (сегодня не в счёт), от
 * `NIGHT_USUAL_MIN` ответов, до `NIGHT_STEP` минут. Меньше — null: кнопки «как обычно» нет, только поле.
 */
export function usualNight(starts: DayStart[], today: string): UsualNight {
  const from = dayKey(addDays(parseDay(today), -NIGHT_USUAL_DAYS))
  const nights = starts.flatMap((s) => (s.day >= from && s.day < today && s.morning?.night ? [s.morning.night] : []))
  if (nights.length < NIGHT_USUAL_MIN) return { bed: null, wake: null }
  /* до 5 минут, но в границах базы: медиана 718 не станет 720 */
  const within = (v: number, lo: number, hi: number) => Math.min(hi - NIGHT_STEP, Math.max(lo, v))
  return {
    bed: within(step(median(nights.map((n) => n.bed))), -HALF, HALF),
    wake: within(step(median(nights.map((n) => n.wake))), 0, DAY),
  }
}

/**
 * Что не пускает начать день: подъём позже, чем сейчас (`future`), или отбой не раньше подъёма (`order`).
 * Не всё заполнено — null: проверять пока нечего.
 */
export function nightProblem(n: { bed: number | null; wake: number | null }, nowMin: number): 'future' | 'order' | null {
  if (n.wake !== null && n.wake > nowMin) return 'future'
  if (n.bed !== null && n.wake !== null && n.bed >= n.wake) return 'order'
  return null
}

const HOWS: readonly string[] = ['usual', 'exact']

/** Те же правила, что в базе: целые минуты в границах, отбой раньше подъёма, способ ответа из двух. */
export function validNight(n: Night): boolean {
  return (
    Number.isInteger(n.bed) &&
    Number.isInteger(n.wake) &&
    n.bed >= -HALF &&
    n.bed < HALF &&
    n.wake >= 0 &&
    n.wake < DAY &&
    n.bed < n.wake &&
    HOWS.includes(n.bedHow) &&
    HOWS.includes(n.wakeHow)
  )
}
