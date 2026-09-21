import { addDays, dayKey, daysBetween, isoDow, parseDay } from './date'
import { pausedOn } from './pauses'
import { fitLinear, lag1, tQuantile } from './regression'
import { MIN_GROUP, MIN_TAG_DAYS } from './stats'
import { activeDays, dayOutcome, lastDay } from './streaks'
import type { Challenge, DayLog, EntryMap, ScoreField } from './types'

/**
 * Эффект челленджей и тегов на оценки дня.
 *
 * Сравнение «средняя в дни с выполнением против дней без» врёт: хороший день сам тянет
 * выполнение, выходные хуже будней, а хорошие дни идут полосами. Поэтому одна регрессия
 * на субъект и шкалу даёт оба окна сразу:
 *
 *   оценка(t) ~ 1 + x(t) + x(t−1) + x(t+1) + выходные(t)
 *
 * x(t) — окно «в тот же день», x(t−1) — «на следующий день», x(t+1) — контроль «накануне»:
 * завтрашнее выполнение не может влиять на сегодняшнюю оценку, и если оно «предсказывает»
 * её так же, как вчерашнее, — это полоса хороших дней, а не эффект.
 */

/** `day` — оценка дня целиком: среднее трёх шкал. */
export type Metric = 'day' | ScoreField
export const METRICS: Metric[] = ['day', 'mood', 'wellbeing', 'productivity']

/** Разница меньше полубалла — «без разницы», даже если она устойчива. */
export const PRACTICAL = 0.5
/** Контроль «накануне» того же знака и не меньше этой доли от эффекта — это полоса. */
export const ECHO_SHARE = 0.5

/**
 * Класс оценки окна, от слабого к сильному:
 * few — мало дней в группе; flat — разница меньше полубалла; unclear — интервал задевает ноль;
 * echo — только «назавтра»: накануне оценки так же выше, это полоса; likely — похоже;
 * strong — уверенно, бывает только «назавтра».
 */
export type Strength = 'few' | 'flat' | 'unclear' | 'echo' | 'likely' | 'strong'

export type Estimate = {
  /** На сколько баллов оценка выше в дни «с», чем в дни «без», с поправками модели. */
  delta: number
  /** 95% интервал разницы. */
  low: number
  high: number
  strength: Strength
  withDays: number
  withoutDays: number
}

export type Windows = { same: Estimate; next: Estimate }

/**
 * Вывод по двум окнам оценки дня:
 * persists — и в тот же день, и назавтра в одну сторону; delayed — сказывается назавтра;
 * rebound — в тот же день и назавтра в разные стороны; streak — полоса, а не эффект;
 * coincidence — связь только с самим днём, назавтра следа нет; sameDayOnly — про тот же день
 * видно, про следующий пока нет; noEffect — разницы нет; unclear — неясно;
 * insufficient — мало данных в обоих окнах.
 */
export type Verdict =
  | 'persists'
  | 'delayed'
  | 'rebound'
  | 'streak'
  | 'coincidence'
  | 'sameDayOnly'
  | 'noEffect'
  | 'unclear'
  | 'insufficient'

/** «Уверенно» или «похоже»; null — слова уверенности нет. Даёт только окно «назавтра». */
export type Confidence = 'sure' | 'likely' | null

export type ChallengeEffect = {
  challenge: Challenge
  windows: Record<Metric, Windows>
  verdict: Verdict
  confidence: Confidence
  /** Челлендж, который делается вместе с этим: его вчерашнее выполнение учтено в модели. */
  partner: Challenge | null
  /** Дней, вошедших в расчёт. */
  days: number
  /** Дней, выброшенных из-за болезни: «болел» в сам день или накануне. */
  sickDays: number
  /** Запасное сравнение «до/после старта» — только когда дни «с» и «без» не набрать. */
  beforeAfter: BeforeAfter | null
}

/** Окно «до/после» — не длиннее месяца с каждой стороны. */
export const BA_SPAN = 30
/** Старты ближе стольких дней друг к другу не разделить. */
export const SAME_START_DAYS = 3

export type BeforeAfter = {
  /** Длина каждого из двух окон в календарных днях; 0 — сравнивать не с чем. */
  span: number
  /** Оценённых дней в окне «до» и «после» — без дней болезни и паузы. */
  daysBefore: number
  daysAfter: number
  byMetric: Record<Metric, Estimate>
  /** Челленджи, начатые или законченные внутри окон, — их влияние тоже в этой разнице. */
  overlaps: Challenge[]
  /** Начаты почти одновременно — чей это эффект, не сказать. */
  inseparableFrom: Challenge[]
}

/** С такой совместностью выполнения (φ) челлендж становится соседом и делит с ним эффект. */
export const PARTNER_PHI = 0.3

export type TagEffect = {
  tag: string
  /** Дней с этим тегом среди оценённых. */
  tagDays: number
  windows: Record<Metric, Windows>
  verdict: Verdict
  confidence: Confidence
  /** Дней, вошедших в расчёт. */
  days: number
  /** Дней, выброшенных из-за болезни. */
  sickDays: number
}

const SICK = 'болел'
const WEEKEND = 'выходной'

const shift = (day: string, by: number) => dayKey(addDays(parseDay(day), by))

/** Оценка дня по метрике: `day` — среднее трёх шкал. */
export const scoreOf = (log: DayLog, metric: Metric) =>
  metric === 'day' ? (log.mood + log.wellbeing + log.productivity) / 3 : log[metric]

/** Уровень для «уверенно»: 99% для оценки дня, для отдельной шкалы — с поправкой на три шкалы. */
const strictLevel = (metric: Metric) => (metric === 'day' ? 0.995 : 1 - 0.01 / 3 / 2)

/** Что анализируем — челлендж или тег — и как с ним обращаться. */
type Subject = {
  /** 1 или 0 в известный день, undefined — день неизвестен и в расчёт не идёт. */
  x: (day: string) => 0 | 1 | undefined
  /** Меньше стольких дней в группе — вывода нет. */
  minGroup: number
  /** Поправка на выходные — кроме тега «выходной», где это сам субъект. */
  weekendControl: boolean
  /** Выбрасывать дни болезни — кроме анализа самого тега «болел». */
  dropSick: boolean
  /** Выполнение соседа в день; неизвестный день — не выполнен. */
  partner?: (day: string) => 0 | 1
}

type Row = { day: string; log: DayLog; now: 0 | 1; before: 0 | 1; after: 0 | 1 }

type Coef = { delta: number; se: number }

const few = (withDays: number, withoutDays: number): Estimate => ({
  delta: 0,
  low: 0,
  high: 0,
  strength: 'few',
  withDays,
  withoutDays,
})

function classify(
  est: Coef,
  withDays: number,
  withoutDays: number,
  minGroup: number,
  next: { lead: Coef; diffSe: number; level: number } | null,
): Estimate {
  const smaller = Math.min(withDays, withoutDays)
  if (smaller < minGroup) return few(withDays, withoutDays)

  const df = Math.max(3, smaller - 1)
  const half = tQuantile(0.975, df) * est.se
  const base = { delta: est.delta, low: est.delta - half, high: est.delta + half, withDays, withoutDays }

  if (Math.abs(est.delta) < PRACTICAL) return { ...base, strength: 'flat' }
  if (base.low <= 0 && base.high >= 0) return { ...base, strength: 'unclear' }
  /* В тот же день причину от следствия не отличить — сильнее «похоже» не бывает. */
  if (!next) return { ...base, strength: 'likely' }

  const { lead } = next
  const sameSign = Math.sign(lead.delta) === Math.sign(est.delta)
  if (sameSign && Math.abs(lead.delta) >= ECHO_SHARE * Math.abs(est.delta)) {
    return { ...base, strength: 'echo' }
  }

  const strict = tQuantile(next.level, df) * est.se
  const clearOfZero = est.delta - strict > 0 || est.delta + strict < 0
  const clearOfLead = Math.abs(est.delta - lead.delta) > tQuantile(0.975, df) * next.diffSe
  const strong = clearOfZero && clearOfLead && smaller >= MIN_GROUP
  return { ...base, strength: strong ? 'strong' : 'likely' }
}

function analyze(subject: Subject, logs: DayLog[]) {
  const byDay = new Map(logs.filter((l) => l.closedAt !== null).map((l) => [l.day, l]))
  const rows: Row[] = []
  let sickDays = 0

  for (const [day, log] of byDay) {
    const now = subject.x(day)
    const before = subject.x(shift(day, -1))
    const after = subject.x(shift(day, 1))
    if (now === undefined || before === undefined || after === undefined) continue
    const sick = log.tags.includes(SICK) || byDay.get(shift(day, -1))?.tags.includes(SICK)
    if (subject.dropSick && sick) {
      sickDays++
      continue
    }
    rows.push({ day, log, now, before, after })
  }

  const count = (pick: (r: Row) => number) => {
    const withDays = rows.filter((r) => pick(r) === 1).length
    return [withDays, rows.length - withDays] as const
  }
  const [sameWith, sameWithout] = count((r) => r.now)
  const [nextWith, nextWithout] = count((r) => r.before)

  /* Столбцы модели; постоянные выкидываются — их не отличить от свободного члена. */
  const columns: { name: string; values: number[] }[] = [
    { name: 'now', values: rows.map((r) => r.now) },
    { name: 'before', values: rows.map((r) => r.before) },
    { name: 'after', values: rows.map((r) => r.after) },
  ]
  if (subject.weekendControl) {
    columns.push({ name: 'weekend', values: rows.map((r) => (isoDow(parseDay(r.day)) >= 5 ? 1 : 0)) })
  }
  const { partner } = subject
  if (partner) {
    columns.push({ name: 'partner', values: rows.map((r) => partner(shift(r.day, -1))) })
  }
  const used = columns.filter((c) => new Set(c.values).size > 1)
  /** Номер столбца в матрице модели; −1 — столбец выкинут как постоянный. */
  const column = (name: string) => {
    const i = used.findIndex((c) => c.name === name)
    return i < 0 ? -1 : i + 1
  }
  const x = rows.map((_r, i) => [1, ...used.map((c) => c.values[i]!)])
  const iNow = column('now')
  const iBefore = column('before')
  const iAfter = column('after')

  const windows = {} as Record<Metric, Windows>
  for (const metric of METRICS) {
    const fit = rows.length ? fitLinear(x, rows.map((r) => scoreOf(r.log, metric))) : null
    if (!fit) {
      windows[metric] = { same: few(sameWith, sameWithout), next: few(nextWith, nextWithout) }
      continue
    }

    /* Хорошие и плохие дни идут полосами — ошибка расширяется на автокорреляцию остатков. */
    const r = lag1(fit.residuals, rows.map((row) => row.day))
    const inflate = Math.sqrt((1 + r) / (1 - r))
    const coef = (i: number): Coef =>
      i < 0 ? { delta: 0, se: 0 } : { delta: fit.beta[i]!, se: Math.sqrt(fit.cov[i]![i]!) * inflate }

    const nextCoef = coef(iBefore)
    const lead = coef(iAfter)
    const covLead = iBefore < 0 || iAfter < 0 ? 0 : fit.cov[iBefore]![iAfter]! * inflate * inflate
    const diffSe = Math.sqrt(Math.max(0, nextCoef.se ** 2 + lead.se ** 2 - 2 * covLead))

    windows[metric] = {
      same:
        iNow < 0
          ? few(sameWith, sameWithout)
          : classify(coef(iNow), sameWith, sameWithout, subject.minGroup, null),
      next:
        iBefore < 0
          ? few(nextWith, nextWithout)
          : classify(nextCoef, nextWith, nextWithout, subject.minGroup, {
              lead,
              diffSe,
              level: strictLevel(metric),
            }),
    }
  }

  return { windows, days: rows.length, sickDays }
}

/** Прошедшие дни челленджа с известным исходом: 1 — взят, 0 — пропуск или срыв. */
function outcomes(c: Challenge, entries: EntryMap, today: Date): Map<string, 0 | 1> {
  const out = new Map<string, 0 | 1>()
  for (const key of activeDays(c, today)) {
    const outcome = dayOutcome(c, entries, parseDay(key), today)
    if (outcome === 'hit') out.set(key, 1)
    else if (outcome === 'miss') out.set(key, 0)
  }
  return out
}

/** Совместность выполнения двух челленджей — φ по дням, известным у обоих, и число этих дней. */
function phi(a: Map<string, 0 | 1>, b: Map<string, 0 | 1>): { phi: number; days: number } {
  let n = 0
  let sa = 0
  let sb = 0
  let sab = 0
  for (const [day, xa] of a) {
    const xb = b.get(day)
    if (xb === undefined) continue
    n++
    sa += xa
    sb += xb
    sab += xa * xb
  }
  if (n < MIN_GROUP) return { phi: 0, days: n }
  const pa = sa / n
  const pb = sb / n
  const spread = Math.sqrt(pa * (1 - pa) * pb * (1 - pb))
  return { phi: spread === 0 ? 0 : (sab / n - pa * pb) / spread, days: n }
}

/**
 * Сосед `c` — челлендж с заметной совместностью (|φ| ≥ PARTNER_PHI), а из нескольких — тот,
 * чья совместность надёжнее: |φ|·√дней. Иначе недавний челлендж, случайно совпавший на двух
 * неделях, перебил бы давний, с которым история общая, и чужой эффект остался бы неучтённым.
 */
function partnerOf(c: Challenge, all: Challenge[], known: Map<string, Map<string, 0 | 1>>) {
  let best: Challenge | null = null
  let bestWeight = 0
  for (const other of all) {
    if (other.id === c.id) continue
    const { phi: p, days } = phi(known.get(c.id)!, known.get(other.id)!)
    const weight = Math.abs(p) * Math.sqrt(days)
    if (Math.abs(p) >= PARTNER_PHI && weight > bestWeight) {
      best = other
      bestWeight = weight
    }
  }
  return best
}

const decided = (s: Strength) => s === 'likely' || s === 'strong'

/** Вывод по двум окнам оценки дня — таблица из плана; уверенность даёт только «назавтра». */
export function verdictOf(day: Windows): { verdict: Verdict; confidence: Confidence } {
  const { same, next } = day
  const confidence: Confidence =
    next.strength === 'strong' ? 'sure' : next.strength === 'likely' ? 'likely' : null

  if (decided(next.strength)) {
    if (!decided(same.strength)) return { verdict: 'delayed', confidence }
    const together = Math.sign(same.delta) === Math.sign(next.delta)
    return { verdict: together ? 'persists' : 'rebound', confidence }
  }
  if (next.strength === 'echo') return { verdict: 'streak', confidence }
  if (next.strength === 'flat') {
    if (decided(same.strength)) return { verdict: 'coincidence', confidence }
    return { verdict: same.strength === 'flat' ? 'noEffect' : 'unclear', confidence }
  }
  if (decided(same.strength)) return { verdict: 'sameDayOnly', confidence }
  const bothFew = next.strength === 'few' && same.strength === 'few'
  return { verdict: bothFew ? 'insufficient' : 'unclear', confidence }
}

/** Вывод словами — для заголовка карточки. Направление берётся из окна, на котором он стоит. */
export function effectText(verdict: Verdict, day: Windows, subject: 'challenge' | 'tag'): string {
  const better = (delta: number) => (delta > 0 ? 'лучше' : 'хуже')
  switch (verdict) {
    case 'persists':
      return `дни ${better(day.next.delta)} — и на следующий день тоже`
    case 'delayed':
      return `следующий день ${better(day.next.delta)}`
    case 'rebound':
      return 'в тот же день и назавтра — в разные стороны'
    case 'streak':
      return day.next.delta > 0
        ? 'похоже на полосу хороших дней: накануне оценки тоже выше'
        : 'похоже на полосу плохих дней: накануне оценки тоже ниже'
    case 'coincidence':
      if (subject === 'tag') return 'связано только с самим днём'
      return `скорее совпадение: в ${day.same.delta > 0 ? 'хорошие' : 'плохие'} дни делаешь чаще, назавтра следа нет`
    case 'sameDayOnly':
      return 'связано с самим днём, про следующий пока неясно'
    case 'noEffect':
      return 'заметной связи нет'
    case 'unclear':
      return 'пока неясно'
    case 'insufficient':
      return 'мало данных'
  }
}

/**
 * Эффект каждого переданного челленджа. Список — целиком, с удалёнными: скрывать их
 * можно только на экране, а соседом удалённый быть может — его история никуда не делась.
 */
export function challengeEffects(
  all: Challenge[],
  entriesById: Record<string, EntryMap>,
  logs: DayLog[],
  today: Date,
): ChallengeEffect[] {
  const known = new Map(all.map((c) => [c.id, outcomes(c, entriesById[c.id] ?? {}, today)]))

  return all.map((challenge) => {
    const mine = known.get(challenge.id)!
    const partner = partnerOf(challenge, all, known)
    const partnerDays = partner ? known.get(partner.id)! : null
    const result = analyze(
      {
        x: (day) => mine.get(day),
        minGroup: MIN_GROUP,
        weekendControl: true,
        dropSick: true,
        partner: partnerDays ? (day) => partnerDays.get(day) ?? 0 : undefined,
      },
      logs,
    )
    const verdict = verdictOf(result.windows.day)
    return {
      challenge,
      partner,
      ...result,
      ...verdict,
      beforeAfter: verdict.verdict === 'insufficient' ? beforeAfter(challenge, all, logs, today) : null,
    }
  })
}

/** Сравнение двух наборов дней по Уэлчу с поправкой на полосы; не сильнее «похоже». */
function compare(before: DayLog[], after: DayLog[], metric: Metric, inseparable: boolean): Estimate {
  if (Math.min(before.length, after.length) < MIN_GROUP) return few(after.length, before.length)

  const rows = [...before.map((log) => ({ log, x: 0 })), ...after.map((log) => ({ log, x: 1 }))]
  const fit = fitLinear(
    rows.map((r) => [1, r.x]),
    rows.map((r) => scoreOf(r.log, metric)),
  )
  if (!fit) return few(after.length, before.length)

  const r = lag1(fit.residuals, rows.map((row) => row.log.day))
  const se = Math.sqrt(fit.cov[1]![1]!) * Math.sqrt((1 + r) / (1 - r))
  const est = classify({ delta: fit.beta[1]!, se }, after.length, before.length, MIN_GROUP, null)
  /* Другой челлендж начат одновременно — чей это эффект, не сказать. */
  if (inseparable && est.strength === 'likely') return { ...est, strength: 'unclear' }
  return est
}

/**
 * Запасное сравнение для челленджа, у которого дни «с» и «без» не набрать: отказ без срывов,
 * привычка почти без пропусков. Месяц до старта против месяца после — и не сильнее «похоже»:
 * челлендж обычно начинают после плохой полосы, и возврат к норме выглядит как эффект.
 */
export function beforeAfter(c: Challenge, all: Challenge[], logs: DayLog[], today: Date): BeforeAfter {
  const closed = logs.filter((l) => l.closedAt !== null)
  const byDay = new Map(closed.map((l) => [l.day, l]))
  const start = parseDay(c.startDate)

  const yesterday = addDays(today, -1)
  const finish = lastDay(c)
  const until = finish && daysBetween(finish, yesterday) > 0 ? finish : yesterday
  const daysSinceStart = Math.max(0, daysBetween(start, until) + 1)
  const firstRated = closed.reduce<string | null>((min, l) => (min === null || l.day < min ? l.day : min), null)
  const daysBeforeStart =
    firstRated !== null && firstRated < c.startDate ? daysBetween(parseDay(firstRated), start) : 0
  const span = Math.min(BA_SPAN, daysSinceStart, daysBeforeStart)

  const sick = (day: string) =>
    Boolean(byDay.get(day)?.tags.includes(SICK) || byDay.get(shift(day, -1))?.tags.includes(SICK))
  const pick = (from: Date) => {
    const out: DayLog[] = []
    for (let i = 0; i < span; i++) {
      const key = dayKey(addDays(from, i))
      const log = byDay.get(key)
      if (log && !sick(key) && !pausedOn(c, key)) out.push(log)
    }
    return out
  }
  const before = pick(addDays(start, -span))
  const after = pick(start)

  const windowFrom = dayKey(addDays(start, -span))
  const windowTo = dayKey(addDays(start, span - 1))
  const inWindow = (d: Date | null) => d !== null && dayKey(d) >= windowFrom && dayKey(d) <= windowTo
  const others = all.filter((o) => o.id !== c.id)
  const overlaps = span ? others.filter((o) => inWindow(parseDay(o.startDate)) || inWindow(lastDay(o))) : []
  const inseparableFrom = others.filter(
    (o) => Math.abs(daysBetween(start, parseDay(o.startDate))) <= SAME_START_DAYS,
  )

  const byMetric = {} as Record<Metric, Estimate>
  for (const metric of METRICS) {
    byMetric[metric] = compare(before, after, metric, inseparableFrom.length > 0)
  }
  return { span, daysBefore: before.length, daysAfter: after.length, byMetric, overlaps, inseparableFrom }
}

/**
 * Эффект тегов дня — той же моделью, без соседа. Тег известен только в оценённый день:
 * день без оценки — «неизвестно», а не «без тега». У «выходного» нет поправки на выходные,
 * «болел» не выбрасывает сам себя. Теги реже `MIN_TAG_DAYS` дней не показываются.
 */
export function tagEffects(logs: DayLog[]): TagEffect[] {
  const closed = logs.filter((l) => l.closedAt !== null)
  const byDay = new Map(closed.map((l) => [l.day, l]))
  const tags = [...new Set(closed.flatMap((l) => l.tags))]

  return tags
    .map((tag) => {
      const tagDays = closed.filter((l) => l.tags.includes(tag)).length
      const result = analyze(
        {
          x: (day) => {
            const log = byDay.get(day)
            if (!log) return undefined
            return log.tags.includes(tag) ? 1 : 0
          },
          minGroup: MIN_TAG_DAYS,
          weekendControl: tag !== WEEKEND,
          dropSick: tag !== SICK,
        },
        closed,
      )
      return { tag, tagDays, ...result, ...verdictOf(result.windows.day) }
    })
    .filter((t) => t.tagDays >= MIN_TAG_DAYS)
    .sort((a, b) => b.tagDays - a.tagDays)
}
