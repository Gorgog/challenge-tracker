import type { Confidence } from '@/domain/effects'
import { cn } from '@/lib/utils'
import { CONFIDENCE_WORD } from './words'

/**
 * Вид бейджа: «уверенно» залит, «похоже» приглушён, «возможно» — одна пунктирная рамка.
 * Рамка в 1px отнимается от отступов, чтобы бейджи были одной высоты.
 */
const LOOK: Record<Exclude<Confidence, null>, string> = {
  sure: 'bg-primary px-2 py-0.5 text-primary-foreground',
  likely: 'bg-muted px-2 py-0.5 text-foreground',
  possible: 'border border-dashed border-muted-foreground px-[7px] py-px text-foreground',
}

/**
 * Слово уверенности вывода. Цвет нейтральный: «уверенно» не значит «хорошо» —
 * уверенно можно и ухудшать день. «Возможно» — ранний вывод, поэтому без заливки.
 */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (!confidence) return null
  return (
    <span className={cn('shrink-0 rounded-md text-[11px] font-semibold', LOOK[confidence])}>
      {CONFIDENCE_WORD[confidence]}
    </span>
  )
}
