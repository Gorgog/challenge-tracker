import { METRICS } from '@/domain/effects'
import { MIN_GROUP } from '@/domain/stats'
import type { Averages, SleepAverages } from '@/domain/trend'
import { cn } from '@/lib/utils'
import { METRIC_LABEL, score1, signed } from './words'

type Tile = { key: string; label: string; now: number | null; before: number | null; days: number; beforeDays: number }

/**
 * Средние за последние 30 дней и сдвиг к предыдущим 30 — в стиле стат-тайла экрана дня. Сон — пятой
 * плиткой, по утрам: его сдвиг решается своим числом утр, а не оценённых дней.
 */
export function ScoreTiles({ averages: a, sleep }: { averages: Averages; sleep?: SleepAverages }) {
  const tiles: Tile[] = METRICS.map((metric) => ({
    key: metric,
    label: METRIC_LABEL[metric],
    now: a.current[metric],
    before: a.previous[metric],
    days: a.currentDays,
    beforeDays: a.previousDays,
  }))
  const withSleep = sleep !== undefined && sleep.current !== null
  if (withSleep) {
    tiles.push({
      key: 'sleep',
      label: 'Сон',
      now: sleep.current,
      before: sleep.previous,
      days: sleep.currentDays,
      beforeDays: sleep.previousDays,
    })
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2', withSleep ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
      {tiles.map((t) => (
        <div
          key={t.key}
          role="group"
          aria-label={t.label}
          className={cn(
            'rounded-xl border border-border bg-card px-4 py-3',
            /* Пятая плитка на телефоне — на всю ширину, а не одна в ряду. */
            t.key === 'sleep' && 'col-span-2 sm:col-span-1',
          )}
        >
          <div className="flex items-baseline gap-2">
            <b className="font-mono text-xl font-semibold tracking-tight">{t.now === null ? '—' : score1(t.now)}</b>
            {t.now !== null && t.before !== null && Math.min(t.days, t.beforeDays) >= MIN_GROUP && (
              <span className="font-mono text-[11px] text-muted-foreground">
                <span className="sr-only">к прошлым 30 дням: </span>
                {signed(t.now - t.before)}
              </span>
            )}
          </div>
          <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">{t.label}</span>
        </div>
      ))}
    </div>
  )
}
