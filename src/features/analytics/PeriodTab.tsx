import type { ReactNode } from 'react'
import { BAD_SLEEP, HARMFUL_TAGS, SCALES, stateOf, type PeriodReport, type TimelineDay } from '@/domain/timeline'
import type { Challenge, Outcome } from '@/domain/types'
import { CompareBlock } from './CompareBlock'
import { SERIES } from './series'
import { Chip, Dot, Lines, Section } from './parts'
import { changeLine, dowDate, eventLabel, num1, periodVerdict, shortDate, signed1 } from './words'

const SCALE_LABEL = { wellbeing: 'самочувствие', mood: 'настроение', sleep: 'сон' } as const

const mark = (o: Outcome) =>
  o === 'hit' ? <span className="text-good">✓</span> : o === 'miss' ? <span className="text-destructive">✗</span> : <span className="text-muted-foreground">·</span>

/**
 * Неделя или 30 дней: итог против прошлого периода, что поменялось в делах, понятное сравнение для
 * тега с самым большим сдвигом, дни недели (или недели у 30 дней) — нажатие открывает разбор, и все
 * цифры по запросу.
 */
export function PeriodTab({
  report,
  days,
  windowStart,
  norm,
  challenge,
  outcomeOf,
  onOpenDay,
  onOpenWeek,
}: {
  report: PeriodReport
  /** История целиком — индексы строк считаются в ней. */
  days: TimelineDay[]
  /** Индекс первого дня окна графика в истории: строки до него открыть нельзя. */
  windowStart: number
  norm: number | null
  challenge: Challenge
  outcomeOf: (day: string) => Outcome
  onOpenDay: (index: number) => void
  onOpenWeek: (index: number) => void
}) {
  const week = report.len < 30
  const indexOf = new Map(days.map((d, i) => [d.day, i]))
  const cur = days.slice(indexOf.get(report.from)!, indexOf.get(report.to)! + 1)
  const changes = report.changes.slice(0, 4).map((c) => ({ ...changeLine(c, challenge, report.len), fromTo: [c.event.was, c.event.now] as [number, number] }))

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[12px] text-muted-foreground">
        {shortDate(report.from)} — {shortDate(report.to)}
        {report.hasPrev && report.prevFrom && report.prevTo && ` · против ${shortDate(report.prevFrom)} — ${shortDate(report.prevTo)}`}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-[17px] font-semibold text-balance">{periodVerdict(report)}</p>
        {report.moves.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {report.moves.map((m) => (
              <Chip key={m.scale} text={`${SCALE_LABEL[m.scale]} ${signed1(m.by)}`} tone={m.by > 0 ? 'up' : 'down'} />
            ))}
          </div>
        )}
      </div>

      {report.hasPrev && (
        <Section title="Что поменялось в делах">
          {changes.length ? (
            <Lines lines={changes} />
          ) : (
            <p className="text-sm text-muted-foreground">
              По записям почти как {week ? 'прошлая неделя' : 'предыдущие 30 дней'}: теги, сон и отметки {challenge.code}{' '}
              сдвинулись мало.
            </p>
          )}
        </Section>
      )}

      {report.compare && <CompareBlock comparison={report.compare} scope={week ? 'за последние 30 дней' : 'в эти 30 дней'} />}

      <Section title={week ? 'Неделя по дням' : '30 дней по неделям'}>
        <div className="flex flex-col overflow-hidden rounded-xl border border-border">
          {week
            ? cur.map((d) => {
                const i = indexOf.get(d.day)!
                return (
                  <Row key={d.day} disabled={i < windowStart} onClick={() => onOpenDay(i)}>
                    <span className="font-mono text-[12px] text-muted-foreground">{dowDate(d.day)}</span>
                    <span className="inline-flex gap-1.5" title="утро и вечер">
                      <Dot value={stateOf(d.morning)} norm={norm} />
                      <Dot value={stateOf(d.evening)} norm={norm} />
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <Pill key={t} text={t} harmful={HARMFUL_TAGS.includes(t)} />
                      ))}
                      {d.morning && d.morning.sleep <= BAD_SLEEP && <Pill text="плохо спал" harmful />}
                      {!d.tags.length && !(d.morning && d.morning.sleep <= BAD_SLEEP) && <span className="text-muted-foreground">—</span>}
                    </span>
                    <span className="font-mono text-[12px] whitespace-nowrap">
                      {challenge.code} {mark(outcomeOf(d.day))}
                    </span>
                  </Row>
                )
              })
            : report.weeks.map((w) => (
                <Row key={w.to} disabled={w.index < windowStart} onClick={() => onOpenWeek(w.index)} wide>
                  <span className="font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                    {shortDate(w.from)}–{shortDate(w.to)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Dot value={w.state} norm={norm} />
                    <span className="font-mono text-[11.5px]">{w.state === null ? '' : num1(w.state)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {Object.entries(w.harmful).map(([t, n]) => (
                      <Pill key={t} text={`${t} ${n}`} harmful />
                    ))}
                    {w.badSleep > 0 && <Pill text={`плохо спал ${w.badSleep}`} harmful />}
                    {!Object.keys(w.harmful).length && !w.badSleep && <span className="text-muted-foreground">—</span>}
                  </span>
                  <span className="font-mono text-[12px] whitespace-nowrap">
                    {challenge.code} {w.known ? `${w.hits}/${w.known}` : '—'}
                  </span>
                </Row>
              ))}
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          {week
            ? 'Точки — утро и вечер: зелёная выше твоей нормы, красная ниже. Нажми на день — откроется его разбор.'
            : 'Точка и число — среднее утр и вечеров недели против твоей нормы. Нажми на неделю — откроется её разбор.'}
        </p>
      </Section>

      <details className="text-[13px]">
        <summary className="cursor-pointer text-[12.5px] text-muted-foreground">Все цифры</summary>
        <div className="mt-2.5 grid gap-4 md:grid-cols-2">
          <Table
            head={[week ? 'эта' : 'эти 30', week ? 'прошлая' : 'прошлые 30', 'сдвиг']}
            rows={SCALES.map((s) => {
              const { now, was } = report.scales[s]
              const series = SERIES.find((x) => x.id === s)!
              return [
                <>
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: series.color }} />
                  {series.label}
                </>,
                now === null ? '—' : num1(now),
                was === null ? '—' : num1(was),
                now !== null && was !== null ? signed1(now - was) : '',
              ]
            })}
          />
          <Table
            head={week ? ['эта', 'прошлая', 'обычно'] : ['эти 30', 'прошлые 30']}
            rows={report.events.map((e) => [
              eventLabel(e, challenge),
              String(e.now),
              report.hasPrev ? String(e.was) : '—',
              ...(week ? [`~${Math.round(e.usual)}`] : []),
            ])}
          />
        </div>
        {week && <p className="mt-1.5 text-[11.5px] text-muted-foreground">«Обычно» — сколько раз за 7 дней в среднем по 30 дням.</p>}
      </details>
    </div>
  )
}

function Row({ children, disabled, onClick, wide = false }: { children: ReactNode; disabled: boolean; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`grid items-center gap-2.5 border-t border-border px-2.5 py-2 text-left first:border-t-0 hover:bg-secondary disabled:cursor-default disabled:opacity-75 disabled:hover:bg-transparent ${
        wide ? 'grid-cols-[6.8em_3.8em_1fr_auto]' : 'grid-cols-[3.2em_2.4em_1fr_auto]'
      }`}
    >
      {children}
    </button>
  )
}

function Pill({ text, harmful = false }: { text: string; harmful?: boolean }) {
  return (
    <span className={`rounded-full border bg-secondary px-2 py-px text-[12px] ${harmful ? 'border-chart-3/45' : 'border-border'}`}>{text}</span>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="py-1 text-left font-medium" />
            {head.map((h) => (
              <th key={h} className="px-1.5 py-1 text-right font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, k) => (
                <td key={k} className={k ? 'px-1.5 py-1.5 text-right font-mono' : 'py-1.5 text-left'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
