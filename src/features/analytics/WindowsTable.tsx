import type { Estimate, Metric, Windows } from '@/domain/effects'
import { cn } from '@/lib/utils'
import { METRIC_LABEL, STRENGTH_WORD, signed } from './words'

type WindowsTableProps = {
  windows: Record<Metric, Windows>
  metrics: Metric[]
  /** Строка «Утро» — справочно, под шкалами; null — утр нет. */
  morning?: Windows | null
  /** Заголовки колонок видны глазу; во второй таблице под раскрытием — только читалке. */
  showHead?: boolean
}

function Cell({ estimate, window }: { estimate: Estimate; window: 'same' | 'next' }) {
  /* В тот же день причину от следствия не отличить — «уверенно» там не бывает даже защитно. */
  const strength = window === 'same' && estimate.strength === 'strong' ? 'likely' : estimate.strength
  const quiet = strength === 'few' || strength === 'flat' || strength === 'unclear'

  return (
    <td className="py-1 pl-2 text-right align-top">
      {strength !== 'few' && <span className="font-mono tabular-nums">{signed(estimate.delta)} </span>}
      <span
        className={cn(
          quiet && 'text-muted-foreground',
          strength === 'strong' && 'font-semibold',
        )}
      >
        {STRENGTH_WORD[strength]}
      </span>
    </td>
  )
}

/** Разница оценки в дни «с» против дней «без» — в тот же день и на следующий. */
export function WindowsTable({ windows, metrics, morning = null, showHead = true }: WindowsTableProps) {
  return (
    <table className="w-full table-fixed text-[12.5px]">
      <colgroup>
        <col className="w-[38%]" />
        <col />
        <col />
      </colgroup>
      <thead className={cn(!showHead && 'sr-only')}>
        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="pb-1 text-left font-semibold">
            <span className="sr-only">Шкала</span>
          </th>
          <th scope="col" className="pb-1 pl-2 text-right font-semibold">
            в тот же день
          </th>
          <th scope="col" className="pb-1 pl-2 text-right font-semibold">
            назавтра
          </th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => (
          <tr key={metric} className="border-t border-border/60">
            <th scope="row" className="py-1 text-left font-normal">
              {METRIC_LABEL[metric]}
            </th>
            <Cell estimate={windows[metric].same} window="same" />
            <Cell estimate={windows[metric].next} window="next" />
          </tr>
        ))}
        {morning && (
          <tr className="border-t border-border/60">
            <th scope="row" className="py-1 text-left font-normal">
              Утро
            </th>
            <Cell estimate={morning.same} window="same" />
            <Cell estimate={morning.next} window="next" />
          </tr>
        )}
      </tbody>
    </table>
  )
}
