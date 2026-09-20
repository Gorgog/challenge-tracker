import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatHuman } from '@/domain/date'
import type { Challenge } from '@/domain/types'
import { cn } from '@/lib/utils'

export type DeletedChallengesProps = {
  challenges: Challenge[]
  onRestore: (id: string) => void
  /** Необратимо: челлендж и его отметки пропадают, в том числе из статистики. */
  onPurge: (id: string) => void
}

/**
 * Корзина внизу списка. Свёрнута, чтобы не мешать, и исчезает целиком, когда пуста.
 * Удаление отсюда — единственный путь стереть челлендж из статистики, поэтому через подтверждение.
 */
export function DeletedChallenges({ challenges, onRestore, onPurge }: DeletedChallengesProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<Challenge | null>(null)

  if (challenges.length === 0) return null

  return (
    <section className="flex flex-col gap-2 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
        Удалённые · {challenges.length}
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs text-muted-foreground">
            Их нет ни на экране дня, ни в списке, но статистика их помнит.
          </p>
          {challenges.map((c) => (
            <div
              key={c.id}
              style={{ '--c': c.color } as CSSProperties}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-dashed border-border px-4 py-2.5"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--c)] font-mono text-[9.5px] font-semibold text-white opacity-50">
                {c.code}
              </span>
              <div className="min-w-0 opacity-70">
                <div className="truncate text-[13.5px] font-medium">{c.name}</div>
                {c.deletedAt && (
                  <div className="font-mono text-[10.5px] text-muted-foreground">
                    удалён {formatHuman(new Date(c.deletedAt))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => onRestore(c.id)}>
                  Вернуть
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(c)}
                  className="text-destructive hover:text-destructive"
                >
                  Удалить навсегда
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight">Удалить навсегда?</DialogTitle>
            <DialogDescription>
              «{confirming?.name}» и все его отметки пропадут, в том числе из статистики.
              Вернуть будет нельзя.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirming) onPurge(confirming.id)
                setConfirming(null)
              }}
            >
              Удалить навсегда
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
