import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatHuman, parseDay } from '@/domain/date'
import { METRICS, type Metric } from '@/domain/effects'
import type { SeriesDay, SleepDay } from '@/domain/trend'
import { plural } from '@/lib/plural'
import { METRIC_LABEL, score1, shortDate } from './words'

const HEIGHT = 200
const PAD = { top: 10, right: 12, bottom: 22, left: 24 }
/** Шкалы — тонкие линии разного штриха: цвета здесь заняты челленджами, путать нельзя. */
const SCALES: { metric: Exclude<Metric, 'day'>; dash: string }[] = [
  { metric: 'mood', dash: '' },
  { metric: 'wellbeing', dash: '5 3' },
  { metric: 'productivity', dash: '1.5 3' },
]
/** Сон — штрих с точкой: четвёртая тонкая линия не должна сливаться со шкалами. */
const SLEEP_DASH = '7 3 1.5 3'

/**
 * Ширина контейнера: график рисуется в настоящих пикселях, чтобы подписи не сжимались на телефоне.
 * Первый замер — сразу при монтировании: наблюдатель размеров срабатывает только вместе с кадрами,
 * и без замера график сначала рисовался бы запасной ширины, а потом прыгал.
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (measured: number) => {
      if (measured > 0) setWidth(Math.max(240, Math.round(measured)))
    }
    apply(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => entry && apply(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Ломаная с разрывами: день без значения рвёт линию, а не роняет её в ноль. */
function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  })
  return d
}

/**
 * Оценки по дням: неделя сглаживает, пропуски рвут, подробности — по наведению, тапу и стрелкам.
 * `sleep` — сон по утрам за те же дни; сопоставляется по дню, без утр линии нет.
 */
export function ScoreTrend({ series, sleep = [] }: { series: SeriesDay[]; sleep?: SleepDay[] }) {
  const [ref, width] = useWidth(640)
  const [active, setActive] = useState<number | null>(null)
  const nights = new Map(sleep.map((d) => [d.day, d]))
  const sleepLine = series.map((d) => nights.get(d.day)?.smooth ?? null)
  const withSleep = sleepLine.some((v) => v !== null)

  const n = series.length
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const step = n > 1 ? plotW / (n - 1) : plotW
  const x = (i: number) => PAD.left + (n > 1 ? i * step : plotW / 2)
  const y = (v: number) => PAD.top + plotH * (1 - v / 10)

  const rated = series.filter((d) => d.raw.day !== null)
  const mean = rated.length ? rated.reduce((s, d) => s + d.raw.day!, 0) / rated.length : null
  const label = `Оценка дня за ${n} ${plural(n, 'день', 'дня', 'дней')}${mean === null ? '' : `: в среднем ${score1(mean)}`}`
  const ticks = series
    .map((d, i) => ({ date: parseDay(d.day), i }))
    .filter(({ date }) => date.getDate() === 1 || date.getDate() === 15)
  /** Подсказка дня — и для глаза, и для читалки. */
  const tipOf = (i: number) => {
    const d = series[i]
    if (!d) return ''
    const date = formatHuman(parseDay(d.day))
    const night = nights.get(d.day)?.raw ?? null
    const slept = night === null ? '' : ` · сон ${score1(night)}`
    if (d.raw.day === null) return `${date} — без оценки${slept}`
    return `${date}: ${METRICS.map((m) => `${METRIC_LABEL[m].toLowerCase()} ${score1(d.raw[m]!)}`).join(' · ')}${slept}`
  }
  const shown = active ?? n - 1

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, (i: number) => number> = {
      ArrowLeft: (i) => i - 1,
      ArrowRight: (i) => i + 1,
      Home: () => 0,
      End: () => n - 1,
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setActive((i) => Math.min(n - 1, Math.max(0, move(i ?? n - 1))))
  }
  /** Крайние подписи оси прижимаются к краю, а не обрезаются. */
  const anchorAt = (px: number) => (px < PAD.left + 16 ? 'start' : px > width - PAD.right - 16 ? 'end' : 'middle')

  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      {/* Слайдер по дням: читалки листают его стрелками в режиме форм, а у картинки стрелки забирают себе. */}
      <svg
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, n - 1)}
        aria-valuenow={shown}
        aria-valuetext={tipOf(shown)}
        tabIndex={0}
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => setActive((i) => i ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        onPointerLeave={(e) => {
          /* После касания браузер тоже шлёт «ушёл» — подсказку гасит только уход мыши. */
          if (e.pointerType === 'mouse') setActive(null)
        }}
      >
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {v}
            </text>
          </g>
        ))}
        {ticks.map(({ date, i }) => (
          <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor={anchorAt(x(i))} fontSize={10} fill="var(--muted-foreground)">
            {shortDate(date)}
          </text>
        ))}

        {SCALES.map(({ metric, dash }) => (
          <path
            key={metric}
            data-line={metric}
            d={linePath(series.map((d) => d.smooth[metric]), x, y)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.25}
            strokeDasharray={dash || undefined}
          />
        ))}
        {withSleep && (
          <path
            data-line="sleep"
            d={linePath(sleepLine, x, y)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.25}
            strokeDasharray={SLEEP_DASH}
          />
        )}
        {series.map((d, i) =>
          d.raw.day === null ? null : (
            <circle key={d.day} cx={x(i)} cy={y(d.raw.day)} r={1.6} fill="var(--primary)" opacity={0.35} />
          ),
        )}
        <path
          data-line="day"
          d={linePath(series.map((d) => d.smooth.day), x, y)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--axis)" />
        )}
        {series.map((d, i) => (
          <rect
            key={d.day}
            data-testid={`day-${d.day}`}
            x={x(i) - step / 2}
            y={PAD.top}
            width={Math.max(step, 1)}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
          />
        ))}
      </svg>

      <div role="status" className="min-h-[1.25rem] font-mono text-[11px] text-foreground">
        {active !== null && tipOf(active)}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="0" x2="18" y1="3" y2="3" stroke="var(--primary)" strokeWidth="2" />
          </svg>
          оценка дня, среднее за неделю
        </li>
        {SCALES.map(({ metric, dash }) => (
          <li key={metric} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                x2="18"
                y1="3"
                y2="3"
                stroke="var(--muted-foreground)"
                strokeWidth="1.25"
                strokeDasharray={dash || undefined}
              />
            </svg>
            {METRIC_LABEL[metric].toLowerCase()}
          </li>
        ))}
        {withSleep && (
          <li className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                x2="18"
                y1="3"
                y2="3"
                stroke="var(--muted-foreground)"
                strokeWidth="1.25"
                strokeDasharray={SLEEP_DASH}
              />
            </svg>
            сон, утром
          </li>
        )}
      </ul>
    </div>
  )
}
