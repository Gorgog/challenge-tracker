import type { Case, Explain } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { plural } from '@/lib/plural'
import { Fold } from './Fold'
import { caseLine, caseName } from './linkWords'

/**
 * «Случаи · обобщать пока рано» — редкие сильные события, перечнем, без среднего. Ключ и кнопка — по имени случая:
 * у тега со ступенями верхняя ступень — свой случай (срез 5б).
 */
export function CasesCard({ list, goal, onShow }: { list: Case[]; goal: Goal; onShow: (days: string[]) => void }) {
  if (!list.length) return null
  return (
    <Fold label="Случаи" title="Случаи · обобщать пока рано">
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={caseName(c)} className="flex flex-col gap-0.5">
            <p className="text-[14.5px]">{caseLine(c, goal)}</p>
            <button
              type="button"
              aria-label={`Показать на графике дни после «${caseName(c)}»`}
              onClick={() => onShow(c.days)}
              className="self-start text-[13.5px] text-primary"
            >
              Показать эти дни на графике
            </button>
          </li>
        ))}
      </ul>
    </Fold>
  )
}

/** «Объясняет плохие дни · это не совет» — теги не в моих силах среди плохих дней окна. */
export function ExplainsCard({ list }: { list: Explain[] }) {
  if (!list.length) return null
  return (
    <Fold label="Объясняет плохие дни" title="Объясняет плохие дни · это не совет">
      <ul className="flex flex-col gap-1 text-[14.5px]">
        {list.map((e) => (
          <li key={e.tag}>{`«${e.tag}» — ${e.count} ${plural(e.count, 'день', 'дня', 'дней')} из ${e.bad} плохих`}</li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">Это не про привычки: такие дни бывают сами. Считали тег в этот день или накануне.</p>
    </Fold>
  )
}
