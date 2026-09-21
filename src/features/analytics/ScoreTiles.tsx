import { METRICS } from '@/domain/effects'
import { MIN_GROUP } from '@/domain/stats'
import type { Averages } from '@/domain/trend'
import { METRIC_LABEL, score1, signed } from './words'

/** Средние за последние 30 дней и сдвиг к предыдущим 30 — в стиле стат-тайла экрана дня. */
export function ScoreTiles({ averages: a }: { averages: Averages }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {METRICS.map((metric) => {
        const now = a.current[metric]
        const before = a.previous[metric]
        return (
          <div
            key={metric}
            role="group"
            aria-label={METRIC_LABEL[metric]}
            className="rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-baseline gap-2">
              <b className="font-mono text-xl font-semibold tracking-tight">{now === null ? '—' : score1(now)}</b>
              {now !== null && before !== null && Math.min(a.currentDays, a.previousDays) >= MIN_GROUP && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  <span className="sr-only">к прошлым 30 дням: </span>
                  {signed(now - before)}
                </span>
              )}
            </div>
            <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {METRIC_LABEL[metric]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
