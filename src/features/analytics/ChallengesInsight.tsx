import { useMemo } from 'react'
import { Link } from 'react-router'
import { useChallenges, useDayLogs, useDayStarts, useEntries } from '@/data/queries'
import { isLive } from '@/domain/challenges'
import { challengeInsight, startedTogether, type HabitInsight, type Insight } from '@/domain/challengeInsight'
import { addDays, parseDay, todayKey } from '@/domain/date'
import { LINK_MIN } from '@/domain/links'
import { isPaused } from '@/domain/pauses'
import { timeline } from '@/domain/timeline'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'
import { num1 } from './words'

const HISTORY = 90
const q = (s: string) => `«${s}»`
const listOf = (v: string[]) => (v.length < 2 ? v.join('') : `${v.slice(0, -1).join(', ')} и ${v[v.length - 1]}`)

function progressText(c: Challenge, r: Insight): string {
  if (r.of !== null && r.ended) return `срок ${r.of} ${plural(r.of, 'день', 'дня', 'дней')} ✓`
  if (isPaused(c)) return `на паузе · ${r.of !== null ? `день ${r.day} из ${r.of}` : `прошло ${r.day} ${plural(r.day, 'день', 'дня', 'дней')}`}`
  if (r.of !== null) return `день ${r.day} из ${r.of}`
  return `идёт ${r.day} ${plural(r.day, 'день', 'дня', 'дней')}`
}

/**
 * Можно ли честно сравнивать дни с привычкой и без — словами (макет «Челленджи»). Счёт пропусков — за окно
 * сравнения (8 недель), а не за весь челлендж, как в шапке, поэтому окно названо.
 */
function habitText(h: HabitInsight): string[] {
  const out: string[] = []
  const m = h.mornings
  if (h.misses === 0) {
    out.push('За 8 недель пропусков нет — сравнить не с чем.')
  } else if (h.done === 0) {
    out.push('За 8 недель выполнений нет — сравнить не с чем.')
  } else if (!h.enough) {
    const lack = h.misses < LINK_MIN ? `пропусков ${h.misses}` : `выполнений ${h.done}`
    let s = `Сравнивать пока рано: за 8 недель ${lack}, нужно ${LINK_MIN}.`
    if (h.morningsWorse && m) s += ` И смотри: пропуски пришлись на утра хуже (${num1(m.miss)} против ${num1(m.hit)}) — простое «с ним лучше» будет нечестным.`
    out.push(s)
  } else if (h.morningsWorse && m) {
    out.push(`Сравнить честно пока нельзя: пропуски чаще приходились на дни, которые уже с утра были тяжёлыми (утро ${num1(m.miss)} против ${num1(m.hit)}).`)
  } else if (h.unfair) {
    out.push('Сравнить честно пока нельзя: пропуски чаще шли после некоторых вечеров.')
  } else if (h.unfair === null) {
    out.push('Утр записано мало — проверить, честно ли сравнение, пока нельзя.')
  } else {
    out.push(
      'Пропуски не совпадают ни с тяжёлыми утрами, ни с вечерами накануне — сравнение будет честным. Покажем его, когда при челлендже появится «на что жду влияния».',
    )
  }
  if (h.after.length) out.push(`Чаще пропуск после: ${h.after.map((a) => `${q(a.tag)} (${a.count})`).join(', ')}.`)
  return out
}

/**
 * «Челленджи» в аналитике (срез 2): сначала прогресс, потом — честно ли сравнивать дни с привычкой и без
 * (тест плохого утра). Чисел влияния нет, пока при создании не спрашиваем, на что ждёшь влияния.
 */
export function ChallengesInsight() {
  const challenges = useChallenges()
  const entries = useEntries()
  const logs = useDayLogs()
  const starts = useDayStarts()
  const todayK = todayKey()

  const live = useMemo(() => (challenges.data ?? []).filter(isLive).sort((a, b) => a.sortOrder - b.sortOrder), [challenges.data])
  const view = useMemo(() => {
    if (!logs.data || !starts.data || !entries.data) return null
    const today = parseDay(todayK)
    const history = timeline(logs.data, starts.data, addDays(today, -(HISTORY - 1)), today)
    return live.map((c) => ({ c, r: challengeInsight(c, entries.data![c.id] ?? {}, history, today) }))
  }, [live, logs.data, starts.data, entries.data, todayK])

  const failed = [challenges, entries, logs, starts].some((x) => x.isError && x.data === undefined)
  const loading = challenges.isPending || entries.isPending || logs.isPending || starts.isPending
  const together = startedTogether(live)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-7">
      <Link to="/analytics" className="self-start text-[14px] text-primary">
        ‹ Аналитика
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Челленджи</h1>
      {failed ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-8 text-center">
          <p className="text-sm">Не удалось загрузить данные — разбор не строю, чтобы не показать неправду. Обнови страницу.</p>
        </div>
      ) : loading || !view ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаю…</p>
      ) : !view.length ? (
        <Link to="/challenges" className="self-start text-[14px] text-primary">
          Челленджей пока нет — заведи первый ›
        </Link>
      ) : (
        <>
          {together.map((g) => (
            <p key={g[0]!.id} className="rounded-xl bg-secondary px-3.5 py-2.5 text-[13.5px]">
              {`${listOf(g.map((c) => q(c.name)))} начались почти вместе — их влияние не разделить.`}
            </p>
          ))}
          {view.map(({ c, r }) => (
            <article key={c.id} aria-label={c.name} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[16px] font-semibold">{c.name}</h2>
                <span className="font-mono text-[14px]">{`${r.hits} из ${r.known}`}</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground">{progressText(c, r)}</p>
              {c.measure === 'bedtime' && <p className="text-[13.5px]">Отбой считается сам из времени, которое ты отмечаешь утром.</p>}
              {r.habit ? (
                habitText(r.habit).map((s) => (
                  <p key={s} className="text-[13.5px]">
                    {s}
                  </p>
                ))
              ) : (
                <p className="text-[13.5px] text-muted-foreground">
                  Сравнений у отказов пока нет: день без отметки считается выдержанным — это может быть и «не записал».
                </p>
              )}
            </article>
          ))}
          <Link to="/challenges" className="self-start text-[14px] text-primary">
            Управлять челленджами ›
          </Link>
        </>
      )}
    </div>
  )
}
