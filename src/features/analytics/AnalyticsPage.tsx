import { useMemo, useState } from 'react'
import { useChallenges, useDayLogs, useDayStarts, useEntries, useSettings } from '@/data/queries'
import { isLive } from '@/domain/challenges'
import { addDays, parseDay, todayKey } from '@/domain/date'
import { morningOpen } from '@/domain/dayStart'
import { dayOutcome } from '@/domain/streaks'
import { dayReport, norm as normOf, periodReport, timeline } from '@/domain/timeline'
import { DEFAULT_SETTINGS, type EntryMap } from '@/domain/types'
import { useClock } from '@/features/day/useClock'
import { DayChart, type ChartMode } from './DayChart'
import { SERIES, type Series } from './series'
import { DayTab } from './DayTab'
import { PeriodTab } from './PeriodTab'
import { shortDate } from './words'

/** Окно графика — всегда последние 30 дней (решение Georgy от 23.09). */
const WINDOW = 30
/** История для сравнений: 30 дней по выбранный против предыдущих 30 — даже у первого дня окна. */
const HISTORY = WINDOW + 2 * WINDOW
/** Челлендж без отметок — не сбой загрузки: сбой показывается отдельно. */
const NO_ENTRIES: EntryMap = {}

type Tab = 'day' | 'week' | 'month'
const TABS: { id: Tab; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: '30 дней' },
]

const CHOICE = 'rounded-lg border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring'
const choice = (on: boolean) =>
  `${CHOICE} ${on ? 'border-foreground bg-foreground text-background' : 'border-input bg-secondary text-foreground'}`

/**
 * «Аналитика» строится заново (23.09): график челленджа — утро и вечер одной линией за 30 дней,
 * полоса выбранного дня и разбор под вкладками «День · Неделя · 30 дней». Причин не утверждает:
 * показывает, что было, и сравнивает дни «с» и «без» по твоим же записям.
 */
export function AnalyticsPage() {
  const challenges = useChallenges()
  const entries = useEntries()
  const logs = useDayLogs()
  const starts = useDayStarts()
  const settings = useSettings()
  const todayK = todayKey()
  /* сегодняшнее утро не «пропущено», пока его можно записать; часы — чтобы час утра прошёл и на открытой странице */
  const { now } = useClock()
  const open = morningOpen(now, (settings.data ?? DEFAULT_SETTINGS).morningUntil)

  const startsData = starts.data
  const live = useMemo(
    () => (challenges.data ?? []).filter(isLive).sort((a, b) => a.sortOrder - b.sortOrder),
    [challenges.data],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const challenge = live.find((c) => c.id === picked) ?? live[0] ?? null

  const history = useMemo(() => {
    if (!logs.data || !startsData) return null
    const today = parseDay(todayK)
    return timeline(logs.data, startsData, addDays(today, -(HISTORY - 1)), today)
  }, [logs.data, startsData, todayK])
  const windowStart = HISTORY - WINDOW
  const window = useMemo(() => history?.slice(windowStart) ?? [], [history, windowStart])
  const norm = useMemo(() => normOf(window), [window])

  /* по умолчанию — последний день с утром или вечером */
  const lastWithData = useMemo(() => {
    for (let i = window.length - 1; i >= 0; i--) if (window[i]!.morning || window[i]!.evening) return i
    return window.length - 1
  }, [window])
  /* выбранный день — датой, а не местом в окне: после полуночи окно сдвигается, а день остаётся */
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const pickedAt = pickedDay === null ? -1 : window.findIndex((d) => d.day === pickedDay)
  const cursor = pickedAt >= 0 ? pickedAt : lastWithData
  const setDay = (i: number) => setPickedDay(window[i]?.day ?? null)

  const [tab, setTab] = useState<Tab>('day')
  const [mode, setMode] = useState<ChartMode>('norm')
  const [shown, setShown] = useState<Record<Series, boolean>>({ wellbeing: true, mood: true, sleep: true })

  const challengeEntries = (challenge && entries.data?.[challenge.id]) || NO_ENTRIES
  const outcomeOf = (day: string) => (challenge ? dayOutcome(challenge, challengeEntries, parseDay(day), parseDay(todayK)) : 'outside')
  const index = windowStart + cursor

  const report = useMemo(() => {
    if (!history || !challenge || cursor < 0) return null
    const today = parseDay(todayK)
    if (tab === 'day') return { kind: 'day' as const, value: dayReport(history, index, window, challenge, challengeEntries, today, open) }
    const len = tab === 'week' ? 7 : 30
    return { kind: 'period' as const, value: periodReport(history, index, len, window, challenge, challengeEntries, today, open) }
  }, [history, challenge, cursor, tab, index, window, challengeEntries, todayK, open])

  /* не загрузилось — ничего не считаем: пустые данные выдали бы сбой за пропуски. Не обновилось в фоне —
     прежние данные верны, график остаётся */
  const failed = [challenges, entries, logs, starts].some((q) => q.isError && q.data === undefined)
  const loading = challenges.isPending || entries.isPending || logs.isPending || starts.isPending

  const toggle = (s: Series) =>
    setShown((cur) => {
      const on = Object.values(cur).filter(Boolean).length
      if (cur[s] && on === 1) return cur
      return { ...cur, [s]: !cur[s] }
    })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-7">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Последние 30 дней: утро и вечер одной линией. Двигай полосу — ниже меняется разбор.
        </p>
      </div>

      {failed ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-8 text-center">
          <p className="text-sm">
            Не удалось загрузить данные — разбор не строю, чтобы не показать неправду. Обнови страницу.
          </p>
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаю…</p>
      ) : !challenge ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Челленджей пока нет. Заведи челлендж — здесь появится его график: утро, вечер и что было вокруг.
          </p>
        </div>
      ) : !window.length ? null : (
        <>
          <div role="group" aria-label="Челлендж" className="flex flex-wrap gap-1.5">
            {live.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === challenge.id}
                onClick={() => setPicked(c.id)}
                className={`${choice(c.id === challenge.id)} inline-flex items-center gap-2 rounded-full`}
              >
                <span className="font-mono text-[11px] font-medium tracking-wide">{c.code}</span>
                {c.name}
              </button>
            ))}
          </div>

          <section aria-label="График" className="rounded-2xl border border-border bg-card px-3.5 pt-3.5 pb-2.5">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1.5">
              <span className="text-[13px] font-semibold">
                {challenge.code} · {shortDate(window[0]!.day)} — {shortDate(window[window.length - 1]!.day)}
              </span>
              <div role="group" aria-label="Вид графика" className="flex gap-1.5">
                {(
                  [
                    ['norm', 'Выше и ниже нормы'],
                    ['lines', 'Три линии'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`${choice(mode === id)} px-2.5 py-1 text-[12px]`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'lines' && (
              <div role="group" aria-label="Что показывать" className="mb-1.5 flex flex-wrap gap-1.5">
                {SERIES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={shown[s.id]}
                    onClick={() => toggle(s.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] ${shown[s.id] ? '' : 'text-muted-foreground opacity-55'}`}
                  >
                    <span className="size-2.5 rounded-full border-2" style={{ borderColor: s.color, background: shown[s.id] ? s.color : 'transparent' }} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <DayChart
              days={window}
              norm={norm}
              challenge={challenge}
              outcomes={window.map((d) => outcomeOf(d.day))}
              cursor={cursor}
              onCursor={setDay}
              mode={mode}
              shown={shown}
              period={tab === 'week' ? 7 : tab === 'month' ? 30 : null}
            />
            <Keys mode={mode} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div role="tablist" aria-label="Разбор" className="flex border-b border-border bg-secondary">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="analytics-panel"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 border-b-2 px-1 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
                    tab === t.id ? 'border-foreground bg-card text-foreground' : 'border-transparent text-muted-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div id="analytics-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="p-4">
              {report?.kind === 'day' && history && (
                <DayTab
                  report={report.value}
                  day={history[index]!}
                  prev={index > 0 ? history[index - 1]! : null}
                  challenge={challenge}
                  canPrev={cursor > 0}
                  canNext={cursor < window.length - 1}
                  onStep={(by) => setDay(Math.max(0, Math.min(window.length - 1, cursor + by)))}
                />
              )}
              {report?.kind === 'period' && history && (
                <PeriodTab
                  report={report.value}
                  days={history}
                  windowStart={windowStart}
                  challenge={challenge}
                  outcomeOf={outcomeOf}
                  onOpenDay={(i) => {
                    setDay(i - windowStart)
                    setTab('day')
                  }}
                  onOpenWeek={(i) => {
                    setDay(i - windowStart)
                    setTab('week')
                  }}
                />
              )}
            </div>
          </section>

          <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Это то, что было, а не доказанные причины: «алкоголь 5 раз» и «утро хуже» стоят рядом, но разбор не
            утверждает, что одно вызвало другое. Пустое место на линии — утро пропущено или день не закрыт; значения
            туда не подставляются.
          </p>
        </>
      )}
    </div>
  )
}

function Keys({ mode }: { mode: ChartMode }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-[11.5px] text-muted-foreground">
      {mode === 'norm' && (
        <>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-3 rounded-sm bg-good/35" />
            выше твоей нормы
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-3 rounded-sm bg-destructive/35" />
            ниже нормы
          </span>
        </>
      )}
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-muted-foreground" />
        утро
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full border-[1.5px] border-muted-foreground" />
        вечер
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-0.5 w-5 bg-muted-foreground" />
        день
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-5 border-t-[1.5px] border-dashed border-muted-foreground" />
        ночь
      </span>
      {mode === 'norm' && <span>· линия — среднее самочувствия и настроения, норма — середина твоих оценок за 30 дней</span>}
    </div>
  )
}
