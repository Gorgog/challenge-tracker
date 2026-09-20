import { CheckIcon, MinusIcon, PlusIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Challenge } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'

/** Шаг счётчика: для крупных целей вроде 10 000 шагов единица бесполезна. */
const stepOf = (goal: number) => (goal >= 1000 ? 500 : 5)

const ru = (n: number) => n.toLocaleString('ru')

export type TaskRowProps = {
  challenge: Challenge
  /** Отметка за день; `undefined` — не отмечено, это не ноль. */
  value: number | undefined
  done: boolean
  streak: number
  /** Номер в списке — он же горячая клавиша. */
  index: number
  /** День закрыт: отметки больше не меняются. */
  frozen: boolean
  onToggle: () => void
  onSetValue: (value: number | undefined) => void
}

export function TaskRow({
  challenge,
  value,
  done,
  streak,
  index,
  frozen,
  onToggle,
  onSetValue,
}: TaskRowProps) {
  const counted = challenge.measure === 'count'
  const step = stepOf(challenge.goal)

  const meta = counted
    ? `${ru(value ?? 0)} из ${ru(challenge.goal)} ${challenge.unit ?? ''} · серия ${streak}`
    : `серия ${streak} ${plural(streak, 'день', 'дня', 'дней')}`

  return (
    <div
      style={{ '--c': challenge.color } as CSSProperties}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 px-4 transition-colors',
        done
          ? 'border-[color-mix(in_oklab,var(--c)_28%,var(--border))] bg-[color-mix(in_oklab,var(--c)_7%,var(--card))]'
          : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        aria-pressed={done}
        aria-label={`Отметить: ${challenge.name}`}
        onClick={onToggle}
        disabled={frozen}
        className={cn(
          'grid size-9 place-items-center rounded-[10px] border-2',
          done
            ? 'border-[var(--c)] bg-[var(--c)] text-white'
            : 'border-input bg-secondary text-transparent',
          frozen
            ? 'cursor-default'
            : cn('transition-transform active:scale-90', !done && 'hover:border-[var(--c)]'),
        )}
      >
        <CheckIcon className="size-[17px]" strokeWidth={3} />
      </button>

      <div>
        <div className="text-[14.5px] font-medium">{challenge.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{meta}</div>
        {counted && (
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-grid">
            <i
              className="block h-full rounded-full bg-[var(--c)]"
              style={{ width: `${Math.min(100, ((value ?? 0) / challenge.goal) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {counted ? (
        <div className="flex items-center gap-2">
          <Hint index={index} frozen={frozen} />
          <StepButton
            label="Меньше"
            onClick={() => onSetValue(Math.max(0, (value ?? 0) - step))}
            disabled={frozen || (value ?? 0) <= 0}
          >
            <MinusIcon className="size-3.5" />
          </StepButton>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${challenge.name}: значение`}
            value={value ?? 0}
            disabled={frozen}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              onSetValue(digits ? Number(digits) : 0)
            }}
            className="w-16 rounded-lg border border-input bg-secondary px-1 py-1.5 text-center font-mono text-sm font-semibold disabled:opacity-60"
          />
          <StepButton
            label="Больше"
            onClick={() => onSetValue((value ?? 0) + step)}
            disabled={frozen}
          >
            <PlusIcon className="size-3.5" />
          </StepButton>
        </div>
      ) : (
        <Hint index={index} frozen={frozen} />
      )}
    </div>
  )
}

/* Подсказка клавиши прячется у закрытого дня: цифра в нём ничего не делает. */
const Hint = ({ index, frozen }: { index: number; frozen: boolean }) =>
  index <= 9 && !frozen ? (
    <span className="rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
      {index}
    </span>
  ) : null

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-lg border border-border bg-secondary hover:border-primary hover:text-primary disabled:opacity-35"
    >
      {children}
    </button>
  )
}
