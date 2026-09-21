/** Привычка (делать) или отказ (не делать) — это разные сущности, см. docs/concept.md. */
export type ChallengeKind = 'do' | 'quit'
/** Галочка за день или число с целью. */
export type ChallengeMeasure = 'binary' | 'count'
/** Пауза — временно не на экране дня. Удаление — отдельно, через `deletedAt`. */
export type ChallengeStatus = 'active' | 'paused'

/** Период паузы: ключи дней включительно, `to: null` — пауза ещё идёт. */
export type Pause = { from: string; to: string | null }

export type Challenge = {
  id: string
  name: string
  /** Короткий код (ОТЖ, БСГ) — чтобы цвет не был единственным опознавателем. */
  code: string
  kind: ChallengeKind
  measure: ChallengeMeasure
  /** Для binary — всегда 1, для count — дневная цель. */
  goal: number
  unit: string | null
  color: string
  /** Теги челленджа — ссылки на `Tag.id`. С тегами дня не пересекаются. */
  tagIds: string[]
  /** Ключ дня начала: `2026-09-01`. */
  startDate: string
  /** Длина периода в днях; null — бессрочный челлендж. */
  lengthDays: number | null
  status: ChallengeStatus
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

export type ScoreField = 'mood' | 'wellbeing' | 'productivity'

/** Блоки экрана дня: привычки, которые отмечаю сам, и отказы, которые идут сами. */
export type DayGroup = 'tasks' | 'holds'

export const DEFAULT_DAY_GROUPS: DayGroup[] = ['tasks', 'holds']
