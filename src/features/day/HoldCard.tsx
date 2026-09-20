import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import type { Challenge } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'

export type HoldCardProps = {
  challenge: Challenge
  /** Срыв отмечен сегодня. */
  failed: boolean
  streak: number
  /** День закрыт: отметки больше не меняются. */
  frozen: boolean
  onToggleRelapse: () => void
}

/**
 * Отказ — не галочка, а счётчик непрерывности: день засчитывается сам,
 * нажимают только когда сорвались. Поэтому герой карточки — число, а не отметка.
 */
export function HoldCard({ challenge, failed, streak, frozen, onToggleRelapse }: HoldCardProps) {
  return (
    <div
      style={{ '--c': challenge.color } as CSSProperties}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 px-4',
        failed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card',
      )}
    >
      <span
        className={cn(
          'grid h-9 min-w-9 place-items-center rounded-[10px] px-2 font-mono text-[15px] font-semibold tabular-nums',
          failed
            ? 'bg-destructive/15 text-destructive'
            : 'bg-[color-mix(in_oklab,var(--c)_15%,transparent)] text-[var(--c)]',
        )}
      >
        {streak}
      </span>

      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-medium">{challenge.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {failed
            ? 'срыв отмечен сегодня'
            : `${plural(streak, 'день', 'дня', 'дней')} без срыва`}
        </div>
      </div>

      <Button
        variant={failed ? 'secondary' : 'outline'}
        size="sm"
        disabled={frozen}
        onClick={onToggleRelapse}
      >
        {failed ? 'убрать срыв' : 'сорвался'}
      </Button>
    </div>
  )
}
