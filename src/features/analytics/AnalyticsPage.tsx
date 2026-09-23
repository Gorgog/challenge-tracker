import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useChallenges, useDayLogs, useDayStarts, useEntries, useSettings } from '@/data/queries'
import { isLive } from '@/domain/challenges'
import { addDays, parseDay, todayKey } from '@/domain/date'
import { morningOpen } from '@/domain/dayStart'
import { changes as changesOf, eventRows, GOALS, usualBand, verdict, type Goal, type Row } from '@/domain/overview'
import { dayOutcome } from '@/domain/streaks'
import { timeline } from '@/domain/timeline'
import { DEFAULT_SETTINGS, type Challenge } from '@/domain/types'
import { useClock } from '@/features/day/useClock'
import { plural } from '@/lib/plural'
import { ChangesCard } from './ChangesCard'
import { DaySheet } from './DaySheet'
import { OverviewChart } from './OverviewChart'
import { GOAL_CHART, GOAL_CHIP, headline, num1 } from './words'

/** История: окно до 30 дней, 28 дней до него для полосы «обычно» и прошлый период для «Что изменилось». */
const HISTORY = 90
const PERIODS = [14, 30] as const
type Period = (typeof PERIODS)[number]

const CHOICE = 'rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring'
const choice = (on: boolean) => `${CHOICE} ${on ? 'border-foreground bg-foreground text-background' : 'border-input bg-card text-foreground'}`

/**
 * «Аналитика», срез 1 новой аналитики (макет одобрен Georgy 24.09): цель, фраза «хуже / как / лучше
 * обычного», график — точка на день против полосы «обычно» по прошлым дням, шторка дня и «Что
 * изменилось». Причин не утверждает: только что было и как это соотносится с твоими же днями.
 */
export function AnalyticsPage() {
  const challenges = useChallenges()
  const entries = useEntries()
  const logs = useDayLogs()
  const starts = useDayStarts()
  const settings = useSettings()
  const todayK = todayKey()
  const { now } = useClock()
  const open = morningOpen(now, (settings.data ?? DEFAULT_SETTINGS).morningUntil)

  const [goal, setGoal] = useState<Goal>('all')
  const [len, setLen] = useState<Period>(14)
  /* открытый день — датой: после полуночи окно сдвигается, а день остаётся */
  const [openDay, setOpenDay] = useState<string | null>(null)

  const live = useMemo(() => (challenges.data ?? []).filter(isLive).sort((a, b) => a.sortOrder - b.sortOrder), [challenges.data])
  const entriesById = useMemo(() => entries.data ?? {}, [entries.data])

  const history = useMemo(() => {
    if (!logs.data || !starts.data) return null
    const today = parseDay(todayK)
    return timeline(logs.data, starts.data, addDays(today, -(HISTORY - 1)), today)
  }, [logs.data, starts.data, todayK])

  const view = useMemo(() => {
    if (!history) return null
    const today = parseDay(todayK)
    const windowStart = history.length - len
    const window = history.slice(windowStart)
    const band = usualBand(history, windowStart, goal)
    const rows = eventRows(window, goal, live, entriesById, today)
    /* под графиком у челленджа — короткий код: имя целиком не помещается в колонку подписей */
    const code = new Map(live.map((c) => [c.id, c.code]))
    const short = (r: Row): Row => (r.kind === 'challenge' ? { ...r, label: code.get(r.key.slice('challenge:'.length)) ?? r.label } : r)
    return {
      window,
      band,
      verdict: verdict(window, band, goal),
      rows: { main: rows.main.map(short), more: rows.more.map(short) },
      changes: changesOf(history, history.length - 1, len, live, entriesById, today, open),
    }
  }, [history, len, goal, live, entriesById, todayK, open])

  /* не загрузилось — ничего не считаем: пустые данные выдали бы сбой за пропуски */
  const failed = [challenges, entries, logs, starts].some((q) => q.isError && q.data === undefined)
  const loading = challenges.isPending || entries.isPending || logs.isPending || starts.isPending

  const outcomeOf = (c: Challenge, day: string) => dayOutcome(c, entriesById[c.id] ?? {}, parseDay(day), parseDay(todayK))
  const sheetDay = openDay ? (history?.find((d) => d.day === openDay) ?? null) : null
  const head = view ? headline(view.verdict, goal, len) : null
  const band = view?.band

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
        <div role="group" aria-label="Период" className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={len === p} onClick={() => setLen(p)} className={choice(len === p)}>
              {p} дней
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Цель" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {GOALS.map((g) => (
          <button key={g} type="button" aria-pressed={goal === g} onClick={() => setGoal(g)} className={choice(goal === g)}>
            {GOAL_CHIP[g]}
          </button>
        ))}
      </div>

      {failed ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-8 text-center">
          <p className="text-sm">Не удалось загрузить данные — разбор не строю, чтобы не показать неправду. Обнови страницу.</p>
        </div>
      ) : loading || !view || !head ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаю…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3.5">
            <p data-testid="headline" className="text-xl font-bold tracking-tight text-balance">
              {head.title}
            </p>
            {head.sub && <p className="text-[13px] text-muted-foreground">{head.sub}</p>}
          </div>

          <section aria-label="График" className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-3">
            <p className="text-[13px] font-semibold">{GOAL_CHART[goal]}</p>
            {band?.kind === 'band' && (
              <p className="text-[12.5px] text-muted-foreground">
                Полоса — твоё обычное: {num1(band.low)}–{num1(band.high)} (
                {band.short
                  ? `пока по ${band.days} ${plural(band.days, 'дню', 'дням', 'дням')}, уточнится`
                  : `по 28 дням до ${len === 14 ? 'этих двух недель' : 'этих 30 дней'}`}
                )
              </p>
            )}
            <OverviewChart days={view.window} goal={goal} band={view.band} rows={view.rows} onOpenDay={(i) => setOpenDay(view.window[i]!.day)} />
          </section>

          <ChangesCard changes={view.changes} len={len} />

          <Link to="/challenges" className="self-start text-[14px] text-primary">
            {live.length ? 'Челленджи ›' : 'Челленджей пока нет — заведи первый ›'}
          </Link>

          <DaySheet day={sheetDay} isToday={openDay === todayK} challenges={live} outcomeOf={outcomeOf} onClose={() => setOpenDay(null)} />
        </>
      )}
    </div>
  )
}
