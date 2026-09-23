import { useState, type KeyboardEvent } from 'react'
import { goalValue, type Band, type Goal, type Row } from '@/domain/overview'
import { BAD_SLEEP, HARMFUL_TAGS, type TimelineDay } from '@/domain/timeline'
import { dayName, num1, shortDate } from './words'
import { useWidth } from './useWidth'

const PLOT = { top: 14, height: 150, left: 66, right: 6 }
const ROW_H = 16
const LABEL = { fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' } as const

/**
 * График цели: одна точка на день против полосы «обычно» (решение Georgy по макету 24.09). Выше полосы —
 * синий кружок, ниже — оранжевый пустой, в полосе — серая точка: цвет и форма вместе. Под графиком —
 * ряды событий; «ещё ряды» — остальные теги и челленджи. Нажатие или Enter на дне открывает его.
 */
export function OverviewChart({
  days,
  goal,
  band,
  rows,
  onOpenDay,
}: {
  days: TimelineDay[]
  goal: Goal
  band: Band
  rows: { main: Row[]; more: Row[] }
  onOpenDay: (index: number) => void
}) {
  const [ref, width] = useWidth(640)
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? [...rows.main, ...rows.more] : rows.main

  const cw = (width - PLOT.left - PLOT.right) / days.length
  const x = (i: number) => PLOT.left + (i + 0.5) * cw
  const y = (v: number) => PLOT.top + PLOT.height * (1 - v / 10)
  const rowsTop = PLOT.top + PLOT.height + 26
  const height = rowsTop + shown.length * ROW_H + 4
  const values = days.map((d) => goalValue(d, goal))

  /* линия связывает соседние дни с записью; пропуск — разрыв, значение не подставляется */
  let path = ''
  values.forEach((v, i) => {
    if (v === null) return
    path += `${i > 0 && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
  })
  const dates = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]

  const open = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenDay(i)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref}>
        <svg width={width} height={height} className="block select-none" aria-hidden={false}>
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
          <path d={path} fill="none" stroke="var(--axis)" strokeWidth={1.2} />
          {values.map((v, i) => {
            if (v === null) return null
            if (band.kind === 'band' && v > band.high) return <circle key={i} data-point="above" cx={x(i)} cy={y(v)} r={4.6} fill="var(--better)" />
            if (band.kind === 'band' && v < band.low)
              return <circle key={i} data-point="below" cx={x(i)} cy={y(v)} r={4.2} fill="var(--card)" stroke="var(--worse)" strokeWidth={2.2} />
            return <circle key={i} data-point="usual" cx={x(i)} cy={y(v)} r={2.4} fill="var(--muted-foreground)" />
          })}
          {dates.map((i) => (
            <text key={i} x={x(i)} y={PLOT.top + PLOT.height + 14} textAnchor="middle" {...LABEL}>
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
                    const h = (10 * (cell as number)) / 10
                    return <rect key={i} x={cx - 4} y={top + 10 - h} width={8} height={Math.max(1, h)} rx={1.5} fill={(cell as number) <= BAD_SLEEP ? 'var(--worse)' : 'var(--axis)'} />
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
          {days.map((d, i) => (
            <rect
              key={d.day}
              role="button"
              tabIndex={0}
              aria-label={`${dayName(d.day)}: ${values[i] === null ? 'нет записи' : num1(values[i]!)}`}
              x={PLOT.left + i * cw}
              y={0}
              width={cw}
              height={height}
              className="cursor-pointer fill-transparent outline-none hover:fill-foreground/5 focus-visible:fill-primary/15"
              onClick={() => onOpenDay(i)}
              onKeyDown={open(i)}
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
      </div>
      {rows.more.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="text-[12.5px] text-primary">
            {expanded ? 'Скрыть ряды ▴' : `ещё ряды: ${rows.more.map((r) => r.label).join(', ')} ▾`}
          </button>
          <span className="text-[12px] text-muted-foreground">нажми на день</span>
        </div>
      )}
    </div>
  )
}
