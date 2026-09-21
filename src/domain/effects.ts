import { addDays, dayKey, daysBetween, isoDow, parseDay } from './date'
import { pausedOn } from './pauses'
import { fitLinear, lag1, tQuantile, type Fit } from './regression'
import { MIN_EARLY, MIN_GROUP, MIN_TAG_DAYS } from './stats'
import { activeDays, dayOutcome, deletedDay, lastDay } from './streaks'
import type { Challenge, DayLog, DayStart, EntryMap, Morning, ScoreField } from './types'

/**
 * Эффект челленджей и тегов на оценки дня.
 *
 * Сравнение «средняя в дни с выполнением против дней без» врёт: хороший день сам тянет
 * выполнение, выходные хуже будней, хорошие дни идут полосами, а оценки со временем растут или
 * падают. Поэтому одна регрессия на субъект и шкалу даёт оба окна сразу:
 *
 *   оценка(t) ~ 1 + x(t) + x(t−1) + x(t+1) + выходные(t) + выходные(t−1) + день(t) [+ сосед(t−1)]
 *
 * x(t) — окно «в тот же день», x(t−1) — «на следующий день», x(t+1) — контроль «накануне»:
 * завтрашнее выполнение не может влиять на сегодняшнюю оценку, и если оно «предсказывает»
 * её так же, как вчерашнее, — это полоса хороших дней, а не эффект. «Выходные вчера» отделяют
 * понедельник и разницу субботы с воскресеньем — иначе ритм недели утекал бы в окно «назавтра».
 * день(t) — номер дня по порядку: общий подъём или спад (выход из выгорания, возврат к норме после
 * плохой полосы) не достаётся челленджу, который пришёлся на это время.
 *
 * Утро (решение Georgy от 21.09) измерено до дел дня. У челленджей окно «в тот же день» считается
 * ещё и при том же утре: к тем же столбцам добавляется утро этого дня, и хорошее утро больше не
 * выдаёт себя за эффект. «Назавтра» на утро не поправляется: для вчерашнего челленджа утро — уже
 * результат, поправка спрятала бы сам эффект. Строка «Утро» — та же модель с утром вместо вечера,
 * справочно.
 */

/** `day` — оценка дня целиком: среднее трёх шкал. */
export type Metric = 'day' | ScoreField
export const METRICS: Metric[] = ['day', 'mood', 'wellbeing', 'productivity']

/** Разница меньше полубалла — не повод для вывода, даже если она устойчива. */
export const PRACTICAL = 0.5

/**
 * Класс оценки окна, от слабого к сильному:
 * few — меньше `MIN_EARLY` дней в группе; tangled — окна не разделить (привычка через день);
 * flat — весь интервал внутри полубалла; unclear — неясно: 70% интервал задевает ноль, разница
 * меньше полубалла или назавтра не отличить от накануне; echo — только «назавтра»: накануне оценки
 * тоже заметно выше, это полоса; possible — возможно, ранний вывод по 70% интервалу, пока в меньшей
 * группе меньше `MIN_GROUP` дней; likely — похоже; strong — уверенно, бывает только «назавтра».
 */
export type Strength = 'few' | 'tangled' | 'flat' | 'unclear' | 'echo' | 'possible' | 'likely' | 'strong'

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
 * tangled — выполнение идёт через день, тот же день и следующий не разделить;
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
  | 'tangled'
  | 'insufficient'

/** «Уверенно», «похоже» или «возможно»; null — слова уверенности нет. Даёт только окно «назавтра». */
export type Confidence = 'sure' | 'likely' | 'possible' | null

export type ChallengeEffect = {
  challenge: Challenge
  windows: Record<Metric, Windows>
  verdict: Verdict
  confidence: Confidence
  /** Челлендж, который делается вместе с этим: его вчерашнее выполнение учтено в модели. */
  partner: Challenge | null
  /** Делается почти всегда вместе с этим — эффекты не разделить, вывод не сильнее «похоже». */
  twin: Challenge | null
  /** Дней, вошедших в расчёт. */
  days: number
  /** Дней, выброшенных из-за болезни: «болел» в сам день или накануне. */
  sickDays: number
  /** Запасное сравнение «до/после старта» — только когда дни «с» и «без» не набрать. */
  beforeAfter: BeforeAfter | null
  /**
   * Окно «в тот же день» посчитано при том же утре: дни «с» и «без» в нём — дни с утром. Иначе
   * утр мало, и окно обычное.
   */
  morningBase: boolean
  /**
   * Строка «Утро» — самочувствие и настроение до дел дня. «В тот же день» — каким было утро в дни
   * «с» (утро раньше дел: это не эффект, а то, какими эти дни были с самого начала), «назавтра» —
   * утро на следующий день. Справочно: вывода и слов не даёт и не сильнее «похоже». null — утр нет.
   */
  morning: Windows | null
}

/** Окно «до/после» — не длиннее месяца с каждой стороны. */
export const BA_SPAN = 30
/** Старты ближе стольких дней друг к другу не разделить. */
export const SAME_START_DAYS = 3

export type BeforeAfter = {
  /** Длина каждого из двух окон в календарных днях; 0 — сравнивать не с чем. */
  span: number
  /** Дней от старта до вчера (или до финиша): 0 — челлендж только начат. */
  sinceStart: number
  /** Дней от первой оценки до старта: 0 — до старта оценок нет. */
  beforeStart: number
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
  /** Строка «Утро» — как у челленджа: справочно, не сильнее «похоже». null — утр нет, и у тега сна. */
  morning: Windows | null
  /** Тег выведен из утра («плохо спал»), а не поставлен вечером. */
  fromMorning: boolean
}

/** Тег болезни: такие дни и следующие за ними в расчёт эффекта не идут. */
export const SICK = 'болел'
/**
 * Тег сна — из утренней шкалы, вечером его не ставят (решение Georgy от 21.09): сон 0–4, ниже
 * «как обычно». Утро пропущено — сон неизвестен, а не «нормальный».
 */
export const SLEEP_TAG = 'плохо спал'
export const BAD_SLEEP = 4
const WEEKEND = 'выходной'

const shift = (day: string, by: number) => dayKey(addDays(parseDay(day), by))
const weekendOf = (day: string) => (isoDow(parseDay(day)) >= 5 ? 1 : 0)

/** Оценка дня по метрике: `day` — среднее трёх шкал. */
export const scoreOf = (log: DayLog, metric: Metric) =>
  metric === 'day' ? (log.mood + log.wellbeing + log.productivity) / 3 : log[metric]

/** Утро одним числом — самочувствие и настроение до дел дня. Сон — отдельная шкала. */
export const morningScore = (m: Morning) => (m.wellbeing + m.mood) / 2

/**
 * Модели при том же утре нужен запас — столько строк сверх её столбцов. С меньшим на 15-м дне
 * «выгорания» она добавляла ложное «в тот же день» (у ЧТН 28% миров против 26% без утра), с пятью —
 * почти нет, а на месяце и полном демо польза та же (разведка этапа 2, 800 свежих миров). Степени
 * свободы окна — не больше этого запаса (`dfCap` у `strengthOf`): с соседом строк с утром бывает
 * немного, а дней в меньшей группе — больше, чем запас.
 */
export const MIN_BASE_RESIDUAL = 5

/**
 * Окно при том же утре берётся, только когда дни с утром — не меньше этой доли дней обычной модели:
 * иначе горстка дней с утром перебила бы долгую историю без утр, и окна описывали бы разные дни.
 */
export const BASE_COVERAGE = 2 / 3

/** Уровень для «уверенно»: 99% для оценки дня, для отдельной шкалы — с поправкой на три шкалы. */
export const strictLevel = (metric: Metric) => (metric === 'day' ? 0.995 : 1 - 0.01 / 3 / 2)

/**
 * Уровень для «возможно» — 70% интервал, ранний вывод, и только пока в меньшей группе меньше
 * `MIN_GROUP` дней: на длинной истории настоящее уже дорастает до «похоже», а на 70% остаётся шум.
 * На демо «выгорание» ранний вывод верен примерно через раз на двух неделях: решение Georgy от
 * 21.09 — ранние выводы важнее того, что они часто ошибаются.
 */
export const POSSIBLE_LEVEL = 0.85

/** Что анализируем — челлендж или тег — и как с ним обращаться. */
type Subject = {
  /** 1 или 0 в известный день, undefined — день неизвестен и в расчёт не идёт. */
  x: (day: string) => 0 | 1 | undefined
  /** Со стольких дней в меньшей группе — «похоже»; раньше вывод не сильнее «возможно». */
  minGroup: number
  /** Поправка на выходные — кроме тега «выходной», где это сам субъект. */
  weekendControl: boolean
  /** Выбрасывать дни болезни — кроме анализа самого тега «болел». */
  dropSick: boolean
  /** Выполнение соседа в день; неизвестный день — не выполнен. */
  partner?: (day: string) => 0 | 1
}

type Row = { day: string; log: DayLog; morning: Morning | null; now: 0 | 1; before: 0 | 1; after: 0 | 1 }

type Coef = { delta: number; se: number }

const blank = (strength: 'few' | 'tangled', withDays: number, withoutDays: number): Estimate => ({
  delta: 0,
  low: 0,
  high: 0,
  strength,
  withDays,
  withoutDays,
})
const few = (withDays: number, withoutDays: number) => blank('few', withDays, withoutDays)

/**
 * Класс оценки окна. «Без разницы» — только когда весь 95% интервал внутри полубалла: широкий
 * интервал вокруг нуля — это «неясно». Вывод — когда разница не меньше полубалла и интервал не
 * задевает ноль: по 95% — «похоже», если в меньшей группе хотя бы `minGroup` дней; по 70% —
 * «возможно», пока в ней меньше `MIN_GROUP` дней. В тот же день (`next` = null) сильнее «похоже»
 * не бывает. Назавтра: накануне оценки тоже заметно выше и разница с ним не значима на том же
 * уровне — полоса. «Уверенно» — 99% интервал (для шкалы строже), значимое отличие от накануне и
 * не меньше десяти дней в группе; для «похоже» отличие от накануне не требуется, иначе инерция
 * настроения глушила бы и настоящее. Степени свободы — по меньшей группе; `dfCap` ограничивает их
 * у модели при том же утре: строк сверх её столбцов бывает меньше, чем дней в группе.
 */
export function strengthOf(
  est: Coef,
  withDays: number,
  withoutDays: number,
  minGroup: number,
  next: { lead: Coef; diffSe: number; level: number } | null,
  dfCap = Infinity,
): Estimate {
  const smaller = Math.min(withDays, withoutDays)
  if (smaller < MIN_EARLY) return few(withDays, withoutDays)

  const df = Math.min(Math.max(3, smaller - 1), dfCap)
  const t95 = tQuantile(0.975, df)
  const half = t95 * est.se
  const base = { delta: est.delta, low: est.delta - half, high: est.delta + half, withDays, withoutDays }

  if (base.low > -PRACTICAL && base.high < PRACTICAL) return { ...base, strength: 'flat' }
  if (Math.abs(est.delta) < PRACTICAL) return { ...base, strength: 'unclear' }
  /* Интервал уровня с квантилем `t` не задевает ноль. */
  const beyond = (t: number) => Math.abs(est.delta) > t * est.se
  const t70 = tQuantile(POSSIBLE_LEVEL, df)
  const early = smaller < MIN_GROUP
  const level = beyond(t95) && smaller >= minGroup ? 'likely' : beyond(t70) && early ? 'possible' : null
  if (!level) return { ...base, strength: 'unclear' }
  if (!next) return { ...base, strength: level }

  const t = level === 'likely' ? t95 : t70
  const { lead } = next
  const clearOfLead = (q: number) => Math.abs(est.delta - lead.delta) > q * next.diffSe
  const leadShows = Math.sign(lead.delta) === Math.sign(est.delta) && Math.abs(lead.delta) > t * lead.se
  /* Накануне оценки тоже заметно выше и назавтра от накануне не отличить — это полоса. */
  if (leadShows && !clearOfLead(t)) return { ...base, strength: 'echo' }
  if (level === 'possible') return { ...base, strength: 'possible' }

  /* «Уверенно» — только когда назавтра отличается и от нуля по 99%, и от контроля «накануне». */
  const strict = tQuantile(next.level, df) * est.se
  const clearOfZero = est.delta - strict > 0 || est.delta + strict < 0
  const strong = clearOfZero && clearOfLead(t95) && smaller >= MIN_GROUP
  return { ...base, strength: strong ? 'strong' : 'likely' }
}

/** Столбцы, без которых модель обходится: их выкидывают по одному, если она не решается. */
const DROPPABLE = ['partner', 'trend', 'weekendBefore', 'weekend', 'after'] as const

/** Хорошие и плохие дни идут полосами — ошибка расширяется на автокорреляцию остатков. */
function coefsOf(fit: Fit, days: string[]) {
  const r = lag1(fit.residuals, days)
  const inflate = Math.sqrt((1 + r) / (1 - r))
  const coef = (i: number): Coef =>
    i < 0 ? { delta: 0, se: 0 } : { delta: fit.beta[i]!, se: Math.sqrt(fit.cov[i]![i]!) * inflate }
  /* Ошибка разницы «назавтра» и «накануне» — с их ковариацией. */
  const diffSe = (a: number, b: number) => {
    const cov = a < 0 || b < 0 ? 0 : fit.cov[a]![b]! * inflate * inflate
    return Math.sqrt(Math.max(0, coef(a).se ** 2 + coef(b).se ** 2 - 2 * cov))
  }
  return { coef, diffSe }
}

/** «Уверенно» → «похоже»: для близнецов и справочной строки «Утро». */
const atMostLikely = (e: Estimate): Estimate => (e.strength === 'strong' ? { ...e, strength: 'likely' } : e)

type Options = {
  /** Утро по дням; пропущенного утра здесь нет. */
  mornings: Map<string, Morning>
  /** Окно «в тот же день» — ещё и при том же утре. Только у челленджей: часть тегов известна до утра. */
  base: boolean
  /** Строка «Утро». */
  morningRow: boolean
}

const NO_MORNINGS: Options = { mornings: new Map(), base: false, morningRow: false }

function analyze(subject: Subject, logs: DayLog[], options: Options = NO_MORNINGS) {
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
    rows.push({ day, log, morning: options.mornings.get(day) ?? null, now, before, after })
  }

  const countIn = (subset: Row[], pick: (r: Row) => number) => {
    const withDays = subset.filter((r) => pick(r) === 1).length
    return [withDays, subset.length - withDays] as const
  }
  const [sameWith, sameWithout] = countIn(rows, (r) => r.now)
  const [nextWith, nextWithout] = countIn(rows, (r) => r.before)

  const columns: { name: string; values: number[] }[] = [
    { name: 'now', values: rows.map((r) => r.now) },
    { name: 'before', values: rows.map((r) => r.before) },
    { name: 'after', values: rows.map((r) => r.after) },
  ]
  if (subject.weekendControl) {
    columns.push({ name: 'weekend', values: rows.map((r) => weekendOf(r.day)) })
    columns.push({ name: 'weekendBefore', values: rows.map((r) => weekendOf(shift(r.day, -1))) })
  }
  /* Номер дня — в долях длины истории: у сотен дней квадраты номеров иначе перевешивали бы
     остальные столбцы матрицы. */
  if (rows.length) {
    const first = rows.reduce((min, r) => (r.day < min ? r.day : min), rows[0]!.day)
    const offsets = rows.map((r) => daysBetween(parseDay(first), parseDay(r.day)))
    const span = Math.max(1, ...offsets)
    columns.push({ name: 'trend', values: offsets.map((o) => o / span) })
  }
  /* used — сосед в модели; tangled — сосед неотделим от самого челленджа. */
  let partnerState: 'none' | 'used' | 'tangled' = 'none'
  const { partner } = subject
  if (partner) {
    const values = rows.map((r) => partner(shift(r.day, -1)))
    const ones = values.filter((v) => v === 1).length
    /* Сосед с горсткой дней «с» или «без» ничего не поправляет — только ломает модель. */
    if (ones >= MIN_GROUP && values.length - ones >= MIN_GROUP) {
      columns.push({ name: 'partner', values })
      partnerState = 'used'
    }
  }

  /* Постоянные столбцы выкидываются сразу — их не отличить от свободного члена. */
  let used = columns.filter((c) => new Set(c.values).size > 1)
  const design = () => rows.map((_r, i) => [1, ...used.map((c) => c.values[i]!)])
  const dayScores = rows.map((r) => scoreOf(r.log, 'day'))
  let x = design()
  let solvable = rows.length > 0 && fitLinear(x, dayScores) !== null
  /* Модель не решается — выкидываем посторонние столбцы по одному, окна оставляем. */
  while (rows.length > 0 && !solvable) {
    const drop = DROPPABLE.find((name) => used.some((c) => c.name === name))
    if (!drop) break
    if (drop === 'partner') partnerState = 'tangled'
    used = used.filter((c) => c.name !== drop)
    x = design()
    solvable = fitLinear(x, dayScores) !== null
  }

  const column = (name: string) => {
    const i = used.findIndex((c) => c.name === name)
    return i < 0 ? -1 : i + 1
  }
  const iNow = column('now')
  const iBefore = column('before')
  const iAfter = column('after')
  /* Окна сплетены: «вчера» — всегда тот же или обратный день, как у привычки через день. */
  const tangled =
    rows.length > 0 && (rows.every((r) => r.now === r.before) || rows.every((r) => r.now !== r.before))

  const windows = {} as Record<Metric, Windows>
  for (const metric of METRICS) {
    const fit = solvable ? fitLinear(x, rows.map((r) => scoreOf(r.log, metric))) : null
    if (!fit) {
      const bigEnough = Math.min(sameWith, sameWithout, nextWith, nextWithout) >= MIN_EARLY
      const kind = tangled && bigEnough ? 'tangled' : 'few'
      windows[metric] = { same: blank(kind, sameWith, sameWithout), next: blank(kind, nextWith, nextWithout) }
      continue
    }
    const { coef, diffSe } = coefsOf(fit, rows.map((row) => row.day))
    windows[metric] = {
      same:
        iNow < 0
          ? few(sameWith, sameWithout)
          : strengthOf(coef(iNow), sameWith, sameWithout, subject.minGroup, null),
      next:
        iBefore < 0
          ? few(nextWith, nextWithout)
          : strengthOf(coef(iBefore), nextWith, nextWithout, subject.minGroup, {
              lead: coef(iAfter),
              diffSe: diffSe(iBefore, iAfter),
              level: strictLevel(metric),
            }),
    }
  }

  /* Дни с утром — для окна при том же утре и для строки «Утро». Столбцы у обеих моделей — те, что
     остались у обычной, кроме постоянных на днях с утром (утро только в будни — «выходные» там одни
     нули): на этих днях такой столбец ничего не поправляет, и без него оценки остальных те же.
     Других решений эти модели не принимают, иначе окна описывали бы разные модели. */
  const morningRows = rows.flatMap((r, i) => (r.morning ? [i] : []))
  const subset = morningRows.map((i) => rows[i]!)
  const subsetDays = subset.map((r) => r.day)
  const kept = used.filter((c) => new Set(morningRows.map((i) => c.values[i])).size > 1)
  const sx = morningRows.map((i) => [1, ...kept.map((c) => c.values[i]!)])
  const keptColumn = (name: string) => {
    const i = kept.findIndex((c) => c.name === name)
    return i < 0 ? -1 : i + 1
  }
  const sNow = keptColumn('now')
  const sBefore = keptColumn('before')
  const sAfter = keptColumn('after')

  /** Окно «в тот же день» при том же утре — или null, если утр мало и окно остаётся обычным. */
  const sameGivenMorning = (): Record<Metric, Estimate> | null => {
    if (!solvable || sNow < 0 || morningRows.length < BASE_COVERAGE * rows.length) return null
    /* Утро — в долях шкалы от «как обычно»: сырые баллы перевешивали бы остальные столбцы. */
    const base = subset.map((r) => (morningScore(r.morning!) - 5) / 10)
    const k = kept.length + 2
    /* Постоянное утро модель и так не решит; проверка — чтобы не полагаться на порог вырожденности. */
    if (new Set(base).size < 2 || subset.length - k < MIN_BASE_RESIDUAL) return null
    const xb = sx.map((row, j) => [...row, base[j]!])
    const [withDays, withoutDays] = countIn(subset, (r) => r.now)
    const out = {} as Record<Metric, Estimate>
    for (const metric of METRICS) {
      const fit = fitLinear(xb, subset.map((r) => scoreOf(r.log, metric)))
      if (!fit) return null
      const { coef } = coefsOf(fit, subsetDays)
      out[metric] = strengthOf(coef(sNow), withDays, withoutDays, subject.minGroup, null, subset.length - k)
    }
    return out.day.strength === 'few' || out.day.strength === 'tangled' ? null : out
  }

  /**
   * Строка «Утро»: те же столбцы, исход — утро. Справочно, не сильнее «похоже». Модель не решается —
   * строки нет: «мало данных» при полных группах было бы неправдой (решение Georgy от 22.09).
   */
  const morningWindows = (): Windows | null => {
    const fit = solvable ? fitLinear(sx, subset.map((r) => morningScore(r.morning!))) : null
    if (!fit) return null
    const [sw, swo] = countIn(subset, (r) => r.now)
    const [nw, nwo] = countIn(subset, (r) => r.before)
    const { coef, diffSe } = coefsOf(fit, subsetDays)
    const same = sNow < 0 ? few(sw, swo) : strengthOf(coef(sNow), sw, swo, subject.minGroup, null)
    const next =
      sBefore < 0
        ? few(nw, nwo)
        : strengthOf(coef(sBefore), nw, nwo, subject.minGroup, {
            lead: coef(sAfter),
            diffSe: diffSe(sBefore, sAfter),
            level: strictLevel('day'),
          })
    return { same: atMostLikely(same), next: atMostLikely(next) }
  }

  return {
    windows,
    days: rows.length,
    sickDays,
    partnerState,
    based: options.base ? sameGivenMorning() : null,
    morning: options.morningRow && subset.length > 0 ? morningWindows() : null,
  }
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

/** Совместность выполнения двух челленджей по дням, известным у обоих. */
function phi(a: Map<string, 0 | 1>, b: Map<string, 0 | 1>): { phi: number; days: number; ones: number } {
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
  if (n < MIN_GROUP) return { phi: 0, days: n, ones: sb }
  const pa = sa / n
  const pb = sb / n
  const spread = Math.sqrt(pa * (1 - pa) * pb * (1 - pb))
  return { phi: spread === 0 ? 0 : (sab / n - pa * pb) / spread, days: n, ones: sb }
}

/**
 * Сосед `c` — челлендж с заметной совместностью (|φ| ≥ PARTNER_PHI), а из нескольких — тот,
 * чья совместность надёжнее: |φ|·√дней. Иначе недавний челлендж, случайно совпавший на двух
 * неделях, перебил бы давний, с которым история общая, и чужой эффект остался бы неучтённым.
 * Кандидат с горсткой выполненных или пропущенных дней соседом не становится.
 */
function partnerOf(c: Challenge, all: Challenge[], known: Map<string, Map<string, 0 | 1>>) {
  let best: Challenge | null = null
  let bestWeight = 0
  for (const other of all) {
    if (other.id === c.id) continue
    const { phi: p, days, ones } = phi(known.get(c.id)!, known.get(other.id)!)
    if (ones < MIN_GROUP || days - ones < MIN_GROUP) continue
    const weight = Math.abs(p) * Math.sqrt(days)
    if (Math.abs(p) >= PARTNER_PHI && weight > bestWeight) {
      best = other
      bestWeight = weight
    }
  }
  return best
}

const decided = (s: Strength) => s === 'possible' || s === 'likely' || s === 'strong'

/** Слово уверенности вывода — по классу окна «назавтра». */
const CONFIDENCE: Partial<Record<Strength, Confidence>> = { strong: 'sure', likely: 'likely', possible: 'possible' }

/** Вывод по двум окнам оценки дня — таблица из плана; уверенность даёт только «назавтра». */
export function verdictOf(day: Windows): { verdict: Verdict; confidence: Confidence } {
  const { same, next } = day
  if (same.strength === 'tangled' || next.strength === 'tangled') return { verdict: 'tangled', confidence: null }
  const confidence = CONFIDENCE[next.strength] ?? null

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

/**
 * Вывод словами — для заголовка карточки. Направление берётся из окна, на котором он стоит.
 * `morningBase` — окно «в тот же день» посчитано при том же утре: «хорошие дни тянут выполнение»
 * уже учтено, но утро знает о дне не всё — поэтому оговорка про совпадение остаётся.
 */
export function effectText(
  verdict: Verdict,
  day: Windows,
  subject: 'challenge' | 'tag',
  morningBase = false,
): string {
  const better = (delta: number) => (delta > 0 ? 'лучше' : 'хуже')
  switch (verdict) {
    case 'persists':
      return `дни ${better(day.next.delta)} — и на следующий день тоже`
    case 'delayed':
      return `следующий день ${better(day.next.delta)}`
    case 'rebound':
      return 'в тот же день и назавтра — в разные стороны'
    case 'streak':
      /* Без слова «похоже»: полоса ставится и на уровне «возможно». */
      return day.next.delta > 0
        ? 'накануне оценки тоже выше — это может быть полоса хороших дней'
        : 'накануне оценки тоже ниже — это может быть полоса плохих дней'
    case 'coincidence':
      if (subject === 'tag') return `день ${better(day.same.delta)} — назавтра следа нет`
      if (morningBase) return `при том же утре день ${better(day.same.delta)}, назавтра следа нет — может быть и совпадением`
      return `скорее совпадение: в ${day.same.delta > 0 ? 'хорошие' : 'плохие'} дни делаешь чаще, назавтра следа нет`
    case 'sameDayOnly':
      if (subject === 'tag') return `день ${better(day.same.delta)}, про следующий пока неясно`
      if (morningBase) {
        return `при том же утре день ${better(day.same.delta)} — может быть и совпадением; про следующий пока неясно`
      }
      return 'связано с самим днём, про следующий пока неясно'
    case 'noEffect':
      return 'заметной связи нет'
    case 'unclear':
      return 'пока неясно'
    case 'tangled':
      return 'выполнение чередуется через день — тот же день и следующий не разделить'
    case 'insufficient':
      return 'мало данных'
  }
}

/** «Уверенно» → «похоже» во всех окнах: для близнецов чей эффект — не сказать. */
function capAtLikely(windows: Record<Metric, Windows>): Record<Metric, Windows> {
  const out = {} as Record<Metric, Windows>
  for (const metric of METRICS) {
    out[metric] = { same: atMostLikely(windows[metric].same), next: atMostLikely(windows[metric].next) }
  }
  return out
}

/** Утро по дням; пропущенное утро — не день с утром. */
const morningsOf = (starts: DayStart[]) =>
  new Map(starts.flatMap((s) => (s.morning ? [[s.day, s.morning] as const] : [])))

/**
 * Эффект каждого переданного челленджа. Список — целиком, с удалёнными: скрывать их
 * можно только на экране, а соседом удалённый быть может — его история никуда не делась.
 * `starts` — начала дней с утром; без них всё считается, как до утра в аналитике.
 */
export function challengeEffects(
  all: Challenge[],
  entriesById: Record<string, EntryMap>,
  logs: DayLog[],
  today: Date,
  starts: DayStart[] = [],
): ChallengeEffect[] {
  const known = new Map(all.map((c) => [c.id, outcomes(c, entriesById[c.id] ?? {}, today)]))
  const mornings = morningsOf(starts)
  const options: Options = { mornings, base: mornings.size > 0, morningRow: mornings.size > 0 }

  return all.map((challenge) => {
    const mine = known.get(challenge.id)!
    const candidate = partnerOf(challenge, all, known)
    const candidateDays = candidate ? known.get(candidate.id)! : null
    const { partnerState, windows: plain, days, sickDays, based, morning } = analyze(
      {
        x: (day) => mine.get(day),
        minGroup: MIN_GROUP,
        weekendControl: true,
        dropSick: true,
        partner: candidateDays ? (day) => candidateDays.get(day) ?? 0 : undefined,
      },
      logs,
      options,
    )
    /* «Назавтра» — всегда из обычной модели: утро на нём не поправляется. */
    const raw = based ? joinSame(plain, based) : plain
    const twin = partnerState === 'tangled' ? candidate : null
    const windows = twin ? capAtLikely(raw) : raw
    const verdict = verdictOf(windows.day)
    return {
      challenge,
      windows,
      ...verdict,
      partner: partnerState === 'used' ? candidate : null,
      twin,
      days,
      sickDays,
      beforeAfter: verdict.verdict === 'insufficient' ? beforeAfter(challenge, all, logs, today) : null,
      morningBase: based !== null,
      morning,
    }
  })
}

/** Окна обычной модели, где «в тот же день» — при том же утре. */
function joinSame(plain: Record<Metric, Windows>, same: Record<Metric, Estimate>): Record<Metric, Windows> {
  const out = {} as Record<Metric, Windows>
  for (const metric of METRICS) out[metric] = { same: same[metric], next: plain[metric].next }
  return out
}

/**
 * Сравнение двух наборов дней по Уэлчу с поправкой на полосы; не сильнее «похоже». «Возможно» здесь
 * не бывает: окна — от `MIN_GROUP` дней, а ранний вывод ставится только на меньших группах.
 */
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
  const est = strengthOf({ delta: fit.beta[1]!, se }, after.length, before.length, MIN_GROUP, null)
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
  let until = finish && daysBetween(finish, yesterday) > 0 ? finish : yesterday
  const gone = deletedDay(c)
  if (gone && daysBetween(parseDay(gone), until) > 0) until = parseDay(gone)
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
  return {
    span,
    sinceStart: daysSinceStart,
    beforeStart: daysBeforeStart,
    daysBefore: before.length,
    daysAfter: after.length,
    byMetric,
    overlaps,
    inseparableFrom,
  }
}

/**
 * Эффект тегов дня — той же моделью, без соседа. Тег известен только в оценённый день:
 * день без оценки — «неизвестно», а не «без тега». У «выходного» нет поправки на выходные,
 * «болел» не выбрасывает сам себя. Теги реже `MIN_EARLY` дней не показываются, «похоже» у тега —
 * с `MIN_TAG_DAYS` дней в группе. Утро на «в тот же день» у тегов не поправляется: часть тегов
 * известна ещё до утра (выходной), и поправка съела бы их эффект.
 */
export function tagEffects(logs: DayLog[], starts: DayStart[] = []): TagEffect[] {
  const closed = logs.filter((l) => l.closedAt !== null)
  const byDay = new Map(closed.map((l) => [l.day, l]))
  const tags = [...new Set(closed.flatMap((l) => l.tags))]
  const mornings = morningsOf(starts)
  const options: Options = { mornings, base: false, morningRow: mornings.size > 0 }

  return tags
    .map((tag) => {
      const tagDays = closed.filter((l) => l.tags.includes(tag)).length
      const { windows, days, sickDays, morning } = analyze(
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
        options,
      )
      return { tag, tagDays, windows, days, sickDays, morning, fromMorning: false, ...verdictOf(windows.day) }
    })
    .concat(mornings.size > 0 ? [sleepEffect(closed, mornings)] : [])
    .filter((t) => t.tagDays >= MIN_EARLY)
    .sort((a, b) => b.tagDays - a.tagDays)
}

/**
 * Тег «плохо спал» — той же моделью, что вечерние теги. Сон известен, когда есть утро: соседнему дню
 * итог не нужен, а сам день в расчёт идёт закрытым, как у всех тегов. Строки «Утро» нет: тег и утро —
 * из одной записи. Дни тега — закрытые дни с плохим сном.
 */
function sleepEffect(closed: DayLog[], mornings: Map<string, Morning>): TagEffect {
  const bad = (m: Morning) => (m.sleep <= BAD_SLEEP ? 1 : 0)
  const tagDays = closed.filter((l) => {
    const m = mornings.get(l.day)
    return m !== undefined && bad(m) === 1
  }).length
  const { windows, days, sickDays } = analyze(
    {
      x: (day) => {
        const m = mornings.get(day)
        return m ? bad(m) : undefined
      },
      minGroup: MIN_TAG_DAYS,
      weekendControl: true,
      dropSick: true,
    },
    closed,
  )
  return { tag: SLEEP_TAG, tagDays, windows, days, sickDays, morning: null, fromMorning: true, ...verdictOf(windows.day) }
}
