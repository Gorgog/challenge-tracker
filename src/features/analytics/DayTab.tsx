import type { DayReport, TimelineDay } from '@/domain/timeline'
import type { Challenge } from '@/domain/types'
import { CompareBlock } from './CompareBlock'
import { SERIES } from './series'
import { Chip, Lines, Section } from './parts'
import { DAY_VERDICT, dayName, factLine, num1, shiftText, signed1 } from './words'

/**
 * Разбор дня: итог против нормы, где сдвинулось (ночь или день), что было — фразами со стрелками,
 * понятное сравнение и, по запросу, все цифры дня.
 */
export function DayTab({
  report,
  day,
  prev,
  challenge,
  canPrev,
  canNext,
  onStep,
}: {
  report: DayReport
  day: TimelineDay
  prev: TimelineDay | null
  challenge: Challenge
  canPrev: boolean
  canNext: boolean
  onStep: (by: number) => void
}) {
  const { norms, vsNorm } = report
  /* утро — к обычному утру, вечер — к обычному вечеру: утро обычно ниже, общая норма его бы занижала */
  const chip = (label: string, v: number | null, d: number | null, than: string) => {
    if (v === null) return <Chip key={label} text={`${label} —`} tone="flat" />
    if (d === null) return <Chip key={label} text={`${label} ${num1(v)}`} tone="flat" />
    return (
      <Chip key={label} text={`${label} ${num1(v)} · ${signed1(d)} ${than}`} tone={d >= 0.5 ? 'up' : d <= -0.5 ? 'down' : 'flat'} />
    )
  }
  const shift = shiftText(report.shift)
  const facts = report.facts.map((f) => factLine(f, challenge))
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <StepButton label="Предыдущий день" disabled={!canPrev} onClick={() => onStep(-1)}>
          ←
        </StepButton>
        <span data-testid="day-title" className="flex-1 text-center font-mono text-[13px] text-muted-foreground">
          {dayName(day.day)}
        </span>
        <StepButton label="Следующий день" disabled={!canNext} onClick={() => onStep(1)}>
          →
        </StepButton>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[17px] font-semibold text-balance">{DAY_VERDICT[report.verdict]}</p>
        <div className="flex flex-wrap gap-1.5">
          {chip('утро', report.morning, vsNorm.morning, 'к обычному утру')}
          {chip('вечер', report.evening, vsNorm.evening, 'к обычному вечеру')}
        </div>
        {shift && <p className="text-[14px]">{shift}</p>}
      </div>

      <Section title="Что было">
        {facts.length ? <Lines lines={facts} /> : <p className="text-sm text-muted-foreground">Записей за этот день нет.</p>}
      </Section>

      {report.compare && <CompareBlock comparison={report.compare} scope="за последние 30 дней" />}

      <details className="text-[13px]">
        <summary className="cursor-pointer text-[12.5px] text-muted-foreground">Все цифры дня</summary>
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="py-1 text-left font-medium" />
                <th className="px-1.5 py-1 text-right font-medium whitespace-nowrap">вечер накануне</th>
                <th className="px-1.5 py-1 text-right font-medium">утро</th>
                <th className="px-1.5 py-1 text-right font-medium">вечер</th>
              </tr>
            </thead>
            <tbody>
              {SERIES.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-1.5 text-left">
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </td>
                  <td className="px-1.5 text-right font-mono">{s.id === 'sleep' ? '—' : cell(prev?.evening?.[s.id])}</td>
                  <td className="px-1.5 text-right font-mono">{s.id === 'sleep' ? cell(day.morning?.sleep) : cell(day.morning?.[s.id])}</td>
                  <td className="px-1.5 text-right font-mono">{s.id === 'sleep' ? '—' : cell(day.evening?.[s.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Ночь — от вечера накануне к утру, день — от утра к вечеру. Обычное утро и обычный вечер — середина
          твоих утренних и вечерних оценок за 30 дней
          {norms.morning === null || norms.evening === null ? '' : ` (${num1(norms.morning)} и ${num1(norms.evening)})`}.
        </p>
      </details>
    </div>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-10 rounded-lg border border-input bg-secondary text-base disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  )
}
