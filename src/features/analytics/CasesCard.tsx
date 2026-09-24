import type { Case, Explain } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { plural } from '@/lib/plural'
import { caseLine } from './linkWords'

const KICKER = 'text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase'
const CARD = 'flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5'

/** «Случаи · обобщать пока рано» — редкие сильные события, перечнем, без среднего. */
export function CasesCard({ list, goal, onShow }: { list: Case[]; goal: Goal; onShow: (days: string[]) => void }) {
  if (!list.length) return null
  return (
    <section aria-label="Случаи" className={CARD}>
      <h2 className={KICKER}>Случаи · обобщать пока рано</h2>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.tag} className="flex flex-col gap-0.5">
            <p className="text-[14.5px]">{caseLine(c, goal)}</p>
            <button type="button" onClick={() => onShow(c.days)} className="self-start text-[13.5px] text-primary">
              Показать эти дни на графике
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** «Объясняет плохие дни · это не совет» — теги не в моих силах среди плохих дней окна. */
export function ExplainsCard({ list }: { list: Explain[] }) {
  if (!list.length) return null
  return (
    <section aria-label="Объясняет плохие дни" className={CARD}>
      <h2 className={KICKER}>Объясняет плохие дни · это не совет</h2>
      <ul className="flex flex-col gap-1 text-[14.5px]">
        {list.map((e) => (
          <li key={e.tag}>{`«${e.tag}» — ${e.count} ${plural(e.count, 'день', 'дня', 'дней')} из ${e.bad} плохих`}</li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">Это не про привычки: такие дни бывают сами. Считали тег в этот день или накануне.</p>
    </section>
  )
}
