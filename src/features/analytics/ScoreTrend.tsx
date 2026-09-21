import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatHuman, parseDay } from '@/domain/date'
import { METRICS, type Metric } from '@/domain/effects'
import type { SeriesDay } from '@/domain/trend'
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

/** Оценки по дням: неделя сглаживает, пропуски рвут, подробности — по наведению, тапу и стрелкам. */
export function ScoreTrend({ series }: { series: SeriesDay[] }) {
  const [ref, width] = useWidth(640)
  const [active, setActive] = useState<number | null>(null)

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
  const current = active === null ? null : series[active]

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const shift = e.key === 'ArrowLeft' ? -1 : 1
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + shift)))
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      <svg
        role="img"
        aria-label={label}
        tabIndex={0}
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => setActive(n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
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
          <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
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
            opacity={0.8}
          />
        ))}
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

      <div role="status" className="min-h-[1.25rem] font-mono text-[11px] text-muted-foreground">
        {current &&
          (current.raw.day === null
            ? `${formatHuman(parseDay(current.day))} — без оценки`
            : `${formatHuman(parseDay(current.day))}: ${METRICS.map(
                (m) => `${METRIC_LABEL[m].toLowerCase()} ${score1(current.raw[m]!)}`,
              ).join(' · ')}`)}
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
      </ul>
    </div>
  )
}
