/** Привычка (делать) или отказ (не делать) — это разные сущности, см. docs/concept.md. */
export type ChallengeKind = 'do' | 'quit'
/**
 * Галочка за день, число с целью или время отбоя («Время» в форме, срез 4б): у `bedtime` отметок нет —
 * выполнение считается из ночи, записанной утром (`domain/bedtime.ts`).
 */
export type ChallengeMeasure = 'binary' | 'count' | 'bedtime'
/**
 * Период паузы: ключи дней включительно, `to: null` — пауза ещё идёт.
 * Челлендж на паузе не показывается на экране дня. Удаление — отдельно, через `deletedAt`.
 */
export type Pause = { from: string; to: string | null }

export type Challenge = {
  id: string
  name: string
  /** Короткий код (ОТЖ, БСГ) — чтобы цвет не был единственным опознавателем. */
  code: string
  kind: ChallengeKind
  measure: ChallengeMeasure
  /** Для binary — всегда 1, для count — дневная цель, для bedtime — лечь не позже: минуты от полуночи утра (23:30 = −30). */
  goal: number
  unit: string | null
  color: string
  /** Теги челленджа — ссылки на `Tag.id`. С тегами дня не пересекаются. */
  tagIds: string[]
  /** Ключ дня начала: `2026-09-01`. */
  startDate: string
  /** Длина периода в днях; null — бессрочный челлендж. */
  lengthDays: number | null
  /**
   * Периоды пауз. Дни внутри — вне челленджа: не пропуск и не выполнение. Серия на них
   * замирает, а финиш срочного челленджа отодвигается на длину паузы.
   */
  pauses: Pause[]
  /**
   * Правила под замком: тип, измерение, цель и срок больше не меняются —
   * иначе статистика задним числом поедет. Имя и теги менять можно.
   */
  rulesLocked: boolean
  /** Мягкое удаление: челлендж пропадает с глаз, но остаётся в статистике. */
  deletedAt: string | null
  sortOrder: number
}

export type Tag = { id: string; name: string }

/** То, что человек заполняет в форме. Остальные поля челленджа вычисляются. */
export type ChallengeDraft = {
  name: string
  /** Пустой — код подставится из названия. */
  code: string
  kind: ChallengeKind
  measure: ChallengeMeasure
  goal: number
  unit: string
  tagIds: string[]
  rulesLocked: boolean
  lengthDays: number | null
}

/** Отметки одного челленджа: ключ дня → значение. Отсутствие ключа — это НЕ ноль. */
export type EntryMap = Record<string, number>

export type DayLog = {
  day: string
  mood: number
  wellbeing: number
  productivity: number
  tags: string[]
  note: string
  closedAt: string | null
}

/** Как дан ответ о ночи: кнопкой «как обычно» или точным временем. */
export type NightHow = 'usual' | 'exact'

/**
 * Ночь перед утром — минуты от полуночи этого дня: лёг в 23:30 = −30, в 01:20 = 80; встал в 7:40 = 460.
 * Одна ось для обоих: длина ночи — `wake − bed`, середина ответов считается без перехода через полночь.
 */
export type Night = { bed: number; wake: number; bedHow: NightHow; wakeHow: NightHow }

/**
 * Утренние оценки 0–10 — сон, самочувствие и настроение до дел дня. `night` нет или null — время сна
 * не записано (утра до 25.09 и сиды без него).
 */
export type Morning = { sleep: number; wellbeing: number; mood: number; night?: Night | null }

/**
 * Начало дня — отдельная запись: утро измерено до сегодняшних дел и служит базой дня.
 * `morning: null` — утро пропущено или день начат после утреннего часа. Утро не правится.
 */
export type DayStart = { day: string; morning: Morning | null; startedAt: string }

/** Настройки. `morningUntil` — час, до которого спрашивается утро; сам час уже не утро. */
export type Settings = { morningUntil: number }

export const DEFAULT_SETTINGS: Settings = { morningUntil: 15 }

/** Итог дня по одному челленджу. */
export type Outcome =
  /** цель взята */
  | 'hit'
  /** привычка пропущена или отказ сорван */
  | 'miss'
  /** день ещё идёт, привычка пока не отмечена */
  | 'pending'
  /** день вне периода челленджа */
  | 'outside'
  /** выполнение не узнать: ночь у «Ложусь раньше» не записана — серия замирает, в долю не идёт, как пауза */
  | 'unknown'

export type ScoreField = 'mood' | 'wellbeing' | 'productivity'

/** Блоки экрана дня: привычки, которые отмечаю сам, и отказы, которые идут сами. */
export type DayGroup = 'tasks' | 'holds'

export const DEFAULT_DAY_GROUPS: DayGroup[] = ['tasks', 'holds']
