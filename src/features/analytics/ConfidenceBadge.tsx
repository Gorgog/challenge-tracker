import type { Confidence } from '@/domain/effects'
import { cn } from '@/lib/utils'
import { CONFIDENCE_WORD } from './words'

/**
 * Слово уверенности вывода. Цвет нейтральный: «уверенно» не значит «хорошо» —
 * уверенно можно и ухудшать день.
 */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (!confidence) return null
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold',
        confidence === 'sure' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {CONFIDENCE_WORD[confidence]}
    </span>
  )
}
