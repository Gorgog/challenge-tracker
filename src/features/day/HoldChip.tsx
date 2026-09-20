import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'

export type HoldChipProps = {
  challenge: Challenge
  /** Срыв отмечен сегодня. */
  failed: boolean
  streak: number
  onToggleRelapse: () => void
}

/**
 * Отказ — не галочка, а счётчик непрерывности: день засчитывается сам,
 * нажатие означает срыв. Поэтому кнопка тут одна и называется «сорвался».
 */
export function HoldChip({ challenge, failed, streak, onToggleRelapse }: HoldChipProps) {
  return (
    <span
      style={{ '--c': challenge.color } as CSSProperties}
      className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-1.5 pl-3 text-[12.5px]"
    >
      <span>
        {challenge.name} — <b className="font-mono text-[13px] text-[var(--c)]">{streak}</b>{' '}
        {plural(streak, 'день', 'дня', 'дней')}
      </span>
      <Button
        variant={failed ? 'outline' : 'secondary'}
        size="sm"
        onClick={onToggleRelapse}
        className="h-6 rounded-full px-2.5 text-[11.5px]"
      >
        {failed ? 'срыв отмечен' : 'сорвался'}
      </Button>
    </span>
  )
}
