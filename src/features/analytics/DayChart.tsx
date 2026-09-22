import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { isoDow, parseDay } from '@/domain/date'
import { BAD_SLEEP, HARMFUL_TAGS, stateOf, type TimelineDay } from '@/domain/timeline'
import type { Challenge, Outcome } from '@/domain/types'
import { SERIES, type Series } from './series'
import { dayName, num1, shortDate } from './words'

export type ChartMode = 'norm' | 'lines'

const H_PLOT = 180
const PAD = { top: 16, right: 8, left: 58 }
const SLEEP_H = 24
const RAIL = 16
const LABEL = { fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' } as const

/**
 * Ширина контейнера: график рисуется в настоящих пикселях, чтобы подписи не сжимались на телефоне.
 * Первый замер — сразу при монтировании: наблюдатель срабатывает только вместе с кадрами, а в
 * скрытой вкладке их нет (errors.md).
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (measured: number) => {
      if (measured > 0) setWidth(Math.max(260, Math.round(measured)))
    }
    apply(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => entry && apply(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** До четырёх самых частых тегов окна — строками под графиком; остальные видны в разборе. */
function topTags(days: TimelineDay[]) {
  const count = new Map<string, number>()
  for (const d of days) for (const t of d.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 4).map(([t]) => t)
}

type Point = { x: number; v: number | null; part: 'morning' | 'evening' }

/**
 * График окна: зигзаг «утро → вечер → утро». Вид «норма» — одна линия среднего самочувствия и
 * настроения, выше нормы — зелёная заливка, ниже — красная, сон — столбики. Вид «Три линии» — шкалы
 * своими цветами. Под графиком — отметки челленджа и строки частых тегов. Выбранный день — две
 * полоски по его краям; двигается пальцем, мышью и стрелками.
 */
export function DayChart({
  days,
  norm,
  challenge,
  outcomes,
  cursor,
  onCursor,
  mode,
  shown,
  period,
}: {
  days: TimelineDay[]
  norm: number | null
  challenge: Challenge
  outcomes: Outcome[]
  cursor: number
  onCursor: (index: number) => void
  mode: ChartMode
  shown: Record<Series, boolean>
  period: number | null
}) {
  const [ref, width] = useWidth(640)
  const clip = useId()
  /* день под пальцем во время протягивания; null — не тянем */
  const drag = useRef<number | null>(null)
  const n = days.length
  const tags = topTags(days)

  const step = (width - PAD.left - PAD.right) / Math.max(1, n)
  const x0 = (i: number) => PAD.left + i * step
  const y = (v: number) => PAD.top + H_PLOT * (1 - v / 10)
  const sleepTop = PAD.top + H_PLOT + 30
  const railsTop = mode === 'norm' ? sleepTop + SLEEP_H + 18 : PAD.top + H_PLOT + 28
  const height = railsTop + RAIL * (1 + tags.length) + 6
  const r = Math.max(1.8, Math.min(3.3, step * 0.17))

  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i))
  const move = (i: number) => {
    const next = clamp(i)
    if (next !== cursor) onCursor(next)
  }
  const dragTo = (i: number) => {
    const next = clamp(i)
    if (next === drag.current) return
    drag.current = next
    onCursor(next)
  }

  const dayAt = (el: SVGSVGElement, clientX: number) =>
    Math.floor((clientX - el.getBoundingClientRect().left - PAD.left) / step)

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = cursor
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.currentTarget.focus({ preventScroll: true })
    dragTo(dayAt(e.currentTarget, e.clientX))
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current !== null) dragTo(dayAt(e.currentTarget, e.clientX))
  }
  const stop = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
    if (e.key in by) move(cursor + by[e.key]!)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(n - 1)
    else return
    e.preventDefault()
  }

  /* точки зигзага: утро — на ¼ дня, вечер — на ¾ */
  const pointsOf = (value: (d: TimelineDay, part: 'morning' | 'evening') => number | null, evenings: boolean) =>
    days.flatMap((d, i): Point[] => {
      const out: Point[] = [{ x: x0(i) + step * 0.25, v: value(d, 'morning'), part: 'morning' }]
      if (evenings) out.push({ x: x0(i) + step * 0.75, v: value(d, 'evening'), part: 'evening' })
      return out
    })
  const segments = (pts: Point[], render: (a: Point, b: Point, k: number) => ReactNode) =>
    pts.slice(1).map((b, k) => {
      const a = pts[k]!
      return a.v === null || b.v === null ? null : render(a, b, k)
    })

  const state = pointsOf((d, part) => stateOf(d[part]), true)
  const yn = norm === null ? null : y(norm)

  /* заливка против нормы — по непрерывным кускам линии */
  const areas: string[] = []
  if (yn !== null) {
    let run: Point[] = []
    const flush = () => {
      if (run.length >= 2) {
        areas.push(`M${run[0]!.x} ${yn}${run.map((p) => `L${p.x} ${y(p.v!)}`).join('')}L${run[run.length - 1]!.x} ${yn}Z`)
      }
      run = []
    }
    for (const p of state) {
      if (p.v === null) flush()
      else run.push(p)
    }
    flush()
  }

  const left = x0(cursor)
  const right = x0(cursor + 1)
  const mid = (left + right) / 2
  const handle = Math.max(16, right - left + 6)
  const m = Math.max(2.2, Math.min(4, step * 0.22))
  const cur = days[cursor]

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="slider"
        tabIndex={0}
        aria-label="День на графике"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={cursor + 1}
        aria-valuetext={cur ? dayName(cur.day) : undefined}
        className="block cursor-ew-resize touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
      >
        {period && (
          <rect
            data-period={period}
            x={x0(Math.max(0, cursor - period + 1))}
            y={PAD.top - 8}
            width={(cursor - Math.max(0, cursor - period + 1) + 1) * step}
            height={height - PAD.top + 4}
            rx={4}
            fill="var(--accent)"
            fillOpacity={0.55}
          />
        )}

        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end" {...LABEL}>
              {v}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          isoDow(parseDay(d.day)) === 0 ? (
            <g key={d.day}>
              <line x1={x0(i)} x2={x0(i)} y1={PAD.top} y2={PAD.top + H_PLOT} stroke="var(--grid)" strokeDasharray="2 3" />
              <text x={x0(i) + step / 2} y={PAD.top + H_PLOT + 15} textAnchor="middle" {...LABEL}>
                {shortDate(d.day)}
              </text>
            </g>
          ) : null,
        )}

        {mode === 'norm' && (
          <>
            {yn !== null && (
              <>
                <clipPath id={`${clip}-above`}>
                  <rect x={0} y={0} width={width} height={yn} />
                </clipPath>
                <clipPath id={`${clip}-below`}>
                  <rect x={0} y={yn} width={width} height={Math.max(0, y(0) - yn)} />
                </clipPath>
                {areas.map((d, k) => (
                  <g key={k}>
                    <path d={d} fill="var(--good)" fillOpacity={0.26} clipPath={`url(#${clip}-above)`} />
                    <path d={d} fill="var(--destructive)" fillOpacity={0.26} clipPath={`url(#${clip}-below)`} />
                  </g>
                ))}
                <line x1={PAD.left} x2={width - PAD.right} y1={yn} y2={yn} stroke="var(--muted-foreground)" strokeDasharray="5 4" />
                <text x={width - PAD.right - 2} y={yn - 5} textAnchor="end" {...LABEL}>
                  норма {num1(norm!)}
                </text>
              </>
            )}
            {segments(state, (a, b, k) => {
              const night = a.part === 'evening'
              return (
                <line
                  key={`s${k}`}
                  data-segment={night ? 'night' : 'day'}
                  x1={a.x}
                  y1={y(a.v!)}
                  x2={b.x}
                  y2={y(b.v!)}
                  stroke="var(--foreground)"
                  strokeOpacity={night ? 0.5 : 0.85}
                  strokeWidth={night ? 1.2 : 1.8}
                  strokeDasharray={night ? '3 3' : undefined}
                  strokeLinecap="round"
                />
              )
            })}
            {state.map((p, k) => {
              if (p.v === null) return null
              const side = norm !== null && p.v >= norm ? 'hi' : 'lo'
              const color = side === 'hi' ? 'var(--good)' : 'var(--destructive)'
              return (
                <circle
                  key={`p${k}`}
                  data-point={p.part}
                  data-side={side}
                  cx={p.x}
                  cy={y(p.v)}
                  r={r}
                  fill={p.part === 'morning' ? color : 'var(--card)'}
                  stroke={color}
                  strokeWidth={p.part === 'morning' ? 0 : 1.6}
                />
              )
            })}
            <text x={PAD.left - 8} y={sleepTop + SLEEP_H - 6} textAnchor="end" {...LABEL}>
              сон
            </text>
            {days.map((d, i) => {
              if (!d.morning) return null
              const bad = d.morning.sleep <= BAD_SLEEP
              const h = Math.max(1.5, (d.morning.sleep / 10) * SLEEP_H)
              const bw = Math.max(2, step * 0.55)
              return (
                <rect
                  key={d.day}
                  data-sleep={bad ? 'bad' : 'ok'}
                  x={x0(i) + (step - bw) / 2}
                  y={sleepTop + SLEEP_H - h}
                  width={bw}
                  height={h}
                  rx={1}
                  fill={bad ? 'var(--destructive)' : 'var(--chart-4)'}
                  fillOpacity={bad ? 0.85 : 0.5}
                />
              )
            })}
          </>
        )}

        {mode === 'lines' &&
          SERIES.filter((s) => shown[s.id]).map((s) => {
            const evenings = s.id !== 'sleep'
            const pts = pointsOf((d, part) => {
              if (s.id === 'sleep') return part === 'morning' ? (d.morning?.sleep ?? null) : null
              return d[part]?.[s.id] ?? null
            }, evenings)
            return (
              <g key={s.id}>
                {segments(pts, (a, b, k) => {
                  const night = evenings && a.part === 'evening'
                  return (
                    <line
                      key={k}
                      data-series={s.id}
                      data-segment={s.id === 'sleep' ? 'sleep' : night ? 'night' : 'day'}
                      x1={a.x}
                      y1={y(a.v!)}
                      x2={b.x}
                      y2={y(b.v!)}
                      stroke={s.color}
                      strokeOpacity={night ? 0.7 : 1}
                      strokeWidth={night ? 1.2 : 2}
                      strokeDasharray={night ? '3 3' : undefined}
                      strokeLinecap="round"
                    />
                  )
                })}
                {pts.map((p, k) =>
                  p.v === null ? null : (
                    <circle
                      key={k}
                      data-series={s.id}
                      cx={p.x}
                      cy={y(p.v)}
                      r={r}
                      fill={p.part === 'morning' ? s.color : 'var(--card)'}
                      stroke={s.color}
                      strokeWidth={p.part === 'morning' ? 0 : 1.4}
                    />
                  ),
                )}
              </g>
            )
          })}

        {/* полосы событий */}
        <line x1={PAD.left} x2={width - PAD.right} y1={railsTop - 10} y2={railsTop - 10} stroke="var(--border)" />
        <text x={PAD.left - 8} y={railsTop + 4} textAnchor="end" {...LABEL}>
          {challenge.code}
        </text>
        {outcomes.map((o, i) => {
          const cx = x0(i) + step / 2
          const cy = railsTop
          if (o === 'hit')
            return challenge.kind === 'do' ? (
              <rect key={i} data-outcome="hit" x={cx - m} y={cy - m} width={2 * m} height={2 * m} rx={1.5} fill="var(--good)" />
            ) : (
              <circle key={i} data-outcome="hit" cx={cx} cy={cy} r={m * 0.55} fill="var(--axis)" />
            )
          if (o === 'miss')
            return (
              <path
                key={i}
                data-outcome="miss"
                d={`M${cx - m} ${cy - m}L${cx + m} ${cy + m}M${cx + m} ${cy - m}L${cx - m} ${cy + m}`}
                stroke="var(--destructive)"
                strokeWidth={1.8}
                strokeLinecap="round"
                fill="none"
              />
            )
          if (o === 'pending')
            return (
              <rect
                key={i}
                data-outcome="pending"
                x={cx - m + 0.75}
                y={cy - m + 0.75}
                width={2 * m - 1.5}
                height={2 * m - 1.5}
                rx={1.5}
                fill="none"
                stroke="var(--axis)"
                strokeWidth={1.2}
              />
            )
          return null
        })}
        {tags.map((t, row) => {
          const cy = railsTop + (row + 1) * RAIL
          return (
            <g key={t} data-tag-row={t}>
              <text x={PAD.left - 8} y={cy + 4} textAnchor="end" {...LABEL}>
                {t.length > 8 ? `${t.slice(0, 7)}.` : t}
              </text>
              {days.map((d, i) =>
                d.tags.includes(t) ? (
                  <circle
                    key={d.day}
                    data-tag={t}
                    cx={x0(i) + step / 2}
                    cy={cy}
                    r={Math.max(2, m * 0.7)}
                    fill={HARMFUL_TAGS.includes(t) ? 'var(--chart-3)' : 'var(--muted-foreground)'}
                  />
                ) : null,
              )}
            </g>
          )
        })}

        {/* выбранный день — две полоски по краям, ручка сверху */}
        {[left, right].map((x, k) => (
          <line key={k} data-bracket={k ? 'right' : 'left'} x1={x} x2={x} y1={PAD.top - 4} y2={height - 2} stroke="var(--foreground)" strokeWidth={1.5} strokeOpacity={0.9} />
        ))}
        <rect x={mid - handle / 2} y={PAD.top - 15} width={handle} height={11} rx={3} fill="var(--foreground)" />
        <path
          d={`M${mid - 3.5} ${PAD.top - 11.5}v4M${mid} ${PAD.top - 11.5}v4M${mid + 3.5} ${PAD.top - 11.5}v4`}
          stroke="var(--background)"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
