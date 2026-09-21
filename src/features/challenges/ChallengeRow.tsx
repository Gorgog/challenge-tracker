import type { CSSProperties } from 'react'
import { LockIcon, PauseIcon, PencilIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatHuman, parseDay } from '@/domain/date'
import { isPaused } from '@/domain/pauses'
import type { Challenge } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'

export type ChallengeRowProps = {
  challenge: Challenge
  tagNames: string[]
  onTogglePause: () => void
  /** Доступна и у запертого: замок закрывает только правила, имя и теги менять можно. */
  onEdit: () => void
  /** Мягкое удаление: челлендж уходит в «Удалённые», статистика его помнит. */
  onDelete: () => void
}

export function ChallengeRow({
  challenge: c,
  tagNames,
  onTogglePause,
  onEdit,
  onDelete,
}: ChallengeRowProps) {
  const paused = isPaused(c)

  const what =
    c.kind === 'quit'
      ? 'отказ'
      : c.measure === 'count'
        ? `цель ${c.goal.toLocaleString('ru')} ${c.unit ?? ''} в день`
        : 'привычка · галочка за день'

  const term = c.lengthDays
    ? `${c.lengthDays} ${plural(c.lengthDays, 'день', 'дня', 'дней')}`
    : 'бессрочно'

  const tagsText = tagNames.map((t) => `«${t}»`).join(' ')
  const meta = [what, term, `с ${formatHuman(parseDay(c.startDate))}`, tagsText]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      style={{ '--c': c.color } as CSSProperties}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3 px-4"
    >
      <span
        className={cn(
          'grid size-8 place-items-center rounded-lg bg-[var(--c)] font-mono text-[10px] font-semibold text-white',
          paused && 'opacity-50',
        )}
      >
        {c.code}
      </span>

      <div className={cn('min-w-0', paused && 'opacity-55')}>
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-medium">{c.name}</span>
          {c.rulesLocked && (
            <span
              role="img"
              aria-label="Правила заперты"
              title="Правила заперты: тип, измерение, цель и срок не меняются"
              className="shrink-0 text-muted-foreground"
            >
              <LockIcon className="size-3" />
            </span>
          )}
        </div>
        {/* Одна строка с многоточием: полный текст — во всплывающей подсказке. */}
        <div title={meta} className="truncate font-mono text-[10.5px] text-muted-foreground">
          {meta}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {paused && (
          <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            на паузе
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onTogglePause}
          aria-label={paused ? 'Снять с паузы' : 'Поставить на паузу'}
          title={paused ? 'Снять с паузы' : 'Поставить на паузу'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Изменить" title="Изменить">
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Удалить"
          title="Удалить — челлендж уйдёт в «Удалённые», статистика его сохранит"
          className="hover:text-destructive"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  )
}
