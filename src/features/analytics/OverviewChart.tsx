import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { goalValue, isComplete, pointClass, type Band, type Goal, type Row } from '@/domain/overview'
import { BAD_SLEEP, HARMFUL_TAGS, type TimelineDay } from '@/domain/timeline'
import { dayName, num1, shortDate } from './words'
import { useWidth } from './useWidth'

const PLOT = { top: 24, height: 150, left: 66, right: 6 }
const ROW_H = 16
const LABEL = { fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' } as const

/**
 * График цели: одна точка на полный день против полосы «обычно» (решение Georgy по макету 24.09). Выше
 * полосы — синий кружок, ниже — оранжевый пустой, в полосе — серая точка: цвет и форма вместе. День,
 * записанный наполовину (сегодня до вечера), — серый пунктирный кружок с подписью, не сравнивается.
 * Под графиком — ряды событий; «ещё ряды» — остальные теги и челленджи. День выбирается пальцем (ведёшь —
 * подсвечен, отпустил — открылся), нажатием, с клавиатуры — ← → и Enter.
 */
export function OverviewChart({
  days,
  goal,
  band,
  rows,
  highlight,
  onOpenDay,
}: {
  days: TimelineDay[]
  goal: Goal
  band: Band
  rows: { main: Row[]; more: Row[] }
  /** Дни, подсвеченные из карточки связи («Показать эти дни на графике»). */
  highlight?: ReadonlySet<string>
  onOpenDay: (index: number) => void
}) {
  const [ref, width] = useWidth(640)
  const [expanded, setExpanded] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dayRefs = useRef<(SVGRectElement | null)[]>([])
  /* нажатие пальцем уже открыло день — следующий за ним click не открывает второй раз */
  const openedByPointer = useRef(false)
  const shown = expanded ? [...rows.main, ...rows.more] : rows.main

  const n = days.length
  const cw = (width - PLOT.left - PLOT.right) / n
  const x = (i: number) => PLOT.left + (i + 0.5) * cw
  const y = (v: number) => PLOT.top + PLOT.height * (1 - v / 10)
  const rowsTop = PLOT.top + PLOT.height + 26
  const height = rowsTop + shown.length * ROW_H + 4
  const values = days.map((d) => goalValue(d, goal))
  const full = days.map((d) => isComplete(d, goal))

  /* линия связывает соседние полные дни; пропуск и неполный день — разрыв, значение не подставляется */
  let path = ''
  values.forEach((v, i) => {
    if (v === null || !full[i]) return
    path += `${i > 0 && full[i - 1] && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
  })
  const dates = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]
  const label = (i: number) =>
    `${dayName(days[i]!.day)}${values[i] === null ? ': нет записи' : `: ${num1(values[i]!)}`}${highlight?.has(days[i]!.day) ? ', подсвечен' : ''}`

  const indexFrom = (e: PointerEvent<SVGSVGElement>) => {
    const own = (e.target as Element).getAttribute?.('data-index')
    if (own !== null && own !== undefined) return Number(own)
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return null
    const i = Math.floor((e.clientX - box.left - PLOT.left) / cw)
    return Math.max(0, Math.min(n - 1, i))
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexFrom(e)
    if (i === null) return
    setScrub(i)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* без захвата палец всё равно ведёт по дням под собой */
    }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (scrub === null) return
    const i = indexFrom(e)
    if (i !== null && i !== scrub) setScrub(i)
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (scrub === null) return
    const i = indexFrom(e) ?? scrub
    setScrub(null)
    openedByPointer.current = true
    onOpenDay(i)
  }
  const onClickDay = (i: number) => (e: MouseEvent) => {
    e.preventDefault()
    if (openedByPointer.current) {
      openedByPointer.current = false
      return
    }
    onOpenDay(i)
  }
  const onKeyDay = (i: number) => (e: KeyboardEvent) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (to !== null) {
      e.preventDefault()
      dayRefs.current[Math.max(0, Math.min(n - 1, to))]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenDay(i)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setScrub(null)}
        >
          {band.kind === 'band' && (
            <>
              <rect x={PLOT.left} y={y(band.high)} width={width - PLOT.left - PLOT.right} height={Math.max(1, y(band.low) - y(band.high))} fill="var(--better)" opacity={0.12} />
              {[band.low, band.high].map((v) => (
                <line key={v} x1={PLOT.left} x2={width - PLOT.right} y1={y(v)} y2={y(v)} stroke="var(--better)" strokeOpacity={0.4} strokeDasharray="2 3" />
              ))}
            </>
          )}
          {[0, 5, 10].map((v) => (
            <g key={v}>
              <line x1={PLOT.left} x2={width - PLOT.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
              <text x={PLOT.left - 6} y={y(v) + 3.5} textAnchor="end" {...LABEL}>
                {v}
              </text>
            </g>
          ))}
          {highlight &&
            days.map((d, i) =>
              highlight.has(d.day) ? (
                <rect key={d.day} data-highlight x={PLOT.left + i * cw} y={PLOT.top - 6} width={cw} height={PLOT.height + 12} fill="var(--muted-foreground)" opacity={0.18} rx={3} />
              ) : null,
            )}
          {scrub !== null && <rect x={PLOT.left + scrub * cw} y={PLOT.top - 6} width={cw} height={height - PLOT.top + 6} fill="var(--primary)" opacity={0.14} rx={3} />}
          <path d={path} fill="none" stroke="var(--axis)" strokeWidth={1.2} />
          {values.map((v, i) => {
            if (v === null) return null
            if (!full[i]) {
              const d = days[i]!
              return (
                <g key={i}>
                  <circle data-point="partial" cx={x(i)} cy={y(v)} r={3.4} fill="var(--card)" stroke="var(--muted-foreground)" strokeDasharray="2 1.5" />
                  {/* подпись — только где хватает места, и у последнего дня: иначе подписи налезают */}
                  {(cw >= 18 || i === n - 1) && (
                    <text x={x(i)} y={y(v) - 8} textAnchor={i === n - 1 ? 'end' : 'middle'} {...LABEL} fontSize={9}>
                      {d.morning ? 'утро' : 'вечер'}
                    </text>
                  )}
                </g>
              )
            }
            const cls = pointClass(v, band)
            if (cls === 'above') return <circle key={i} data-point="above" cx={x(i)} cy={y(v)} r={4.6} fill="var(--better)" />
            if (cls === 'below') return <circle key={i} data-point="below" cx={x(i)} cy={y(v)} r={4.2} fill="var(--card)" stroke="var(--worse)" strokeWidth={2.2} />
            return <circle key={i} data-point="usual" cx={x(i)} cy={y(v)} r={2.4} fill="var(--muted-foreground)" />
          })}
          {dates.map((i) => (
            <text key={i} x={x(i)} y={PLOT.top + PLOT.height + 14} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} {...LABEL}>
              {shortDate(days[i]!.day)}
            </text>
          ))}
          {shown.map((row, r) => {
            const top = rowsTop + r * ROW_H
            const mid = top + 5
            return (
              <g key={row.key}>
                <text x={PLOT.left - 6} y={top + 8.5} textAnchor="end" {...LABEL}>
                  {row.label}
                </text>
                {row.cells.map((cell, i) => {
                  const cx = x(i)
                  if (cell === null) return null
                  if (row.kind === 'sleep') {
                    const h = cell as number
                    return <rect key={i} x={cx - 4} y={top + 10 - h} width={8} height={Math.max(1, h)} rx={1.5} fill={h <= BAD_SLEEP ? 'var(--worse)' : 'var(--axis)'} />
                  }
                  if (row.kind === 'late') {
                    if (cell === 'no') return <circle key={i} data-late="no" cx={cx} cy={mid} r={1.2} fill="var(--axis)" />
                    return <rect key={i} data-late="late" x={cx - 4} y={mid - 4} width={8} height={8} rx={1.5} fill="var(--worse)" opacity={0.75} />
                  }
                  if (row.kind === 'tag') {
                    if (cell === 'no') return <circle key={i} cx={cx} cy={mid} r={1.2} fill="var(--axis)" />
                    return <rect key={i} x={cx - 4} y={mid - 4} width={8} height={8} rx={1.5} fill={HARMFUL_TAGS.includes(row.label) ? 'var(--worse)' : 'var(--secondary-foreground)'} />
                  }
                  if (cell === 'hit') return <circle key={i} cx={cx} cy={mid} r={3.2} fill="var(--better)" />
                  if (cell === 'miss') return <path key={i} d={`M${cx - 3} ${mid - 3}l6 6M${cx + 3} ${mid - 3}l-6 6`} stroke="var(--worse)" strokeWidth={1.6} />
                  if (cell === 'pending') return <circle key={i} cx={cx} cy={mid} r={2.6} fill="none" stroke="var(--muted-foreground)" />
                  return null
                })}
              </g>
            )
          })}
          {scrub !== null && (
            <text
              x={Math.max(PLOT.left, Math.min(width - PLOT.right, x(scrub)))}
              y={11}
              textAnchor={x(scrub) < width * 0.3 ? 'start' : x(scrub) > width * 0.7 ? 'end' : 'middle'}
              fontSize={11}
              fontFamily="var(--font-mono)"
              fill="var(--foreground)"
            >
              {`${dayName(days[scrub]!.day)} · ${values[scrub] === null ? 'нет записи' : num1(values[scrub]!)}`}
            </text>
          )}
          {days.map((d, i) => (
            <rect
              key={d.day}
              ref={(el) => {
                dayRefs.current[i] = el
              }}
              data-index={i}
              role="button"
              tabIndex={0}
              aria-label={label(i)}
              x={PLOT.left + i * cw}
              y={0}
              width={cw}
              height={height}
              className="cursor-pointer fill-transparent outline-none hover:fill-foreground/5 focus-visible:fill-primary/15"
              onClick={onClickDay(i)}
              onKeyDown={onKeyDay(i)}
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-better" />
          лучше обычного
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          как обычно
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full border-2 border-worse" />
          хуже
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full border border-dashed border-muted-foreground" />
          записан наполовину
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rows.more.length > 0 ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="text-[12.5px] text-primary">
            {expanded ? 'Скрыть ряды ▴' : `ещё ряды — ${rows.more.length} ▾`}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[12px] text-muted-foreground">веди пальцем по графику или нажми на день</span>
      </div>
    </div>
  )
}
