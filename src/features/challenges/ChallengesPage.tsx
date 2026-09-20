import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { useChallenges, useCreateChallenge } from '@/data/queries'
import { formatHuman, parseDay } from '@/domain/date'
import type { Challenge } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import { ChallengeForm } from './ChallengeForm'

export function ChallengesPage() {
  const challenges = useChallenges()
  const createChallenge = useCreateChallenge()
  const [formOpen, setFormOpen] = useState(false)

  const list = challenges.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Челленджи</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {list.length} {plural(list.length, 'челлендж', 'челленджа', 'челленджей')}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <PlusIcon className="size-4" />
          Новый челлендж
        </Button>
      </div>

      {challenges.isPending ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаю…</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Челленджей пока нет. Заведи первый — он появится на экране дня.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((c) => (
            <ChallengeRow key={c.id} challenge={c} />
          ))}
        </div>
      )}

      {formOpen && (
        <ChallengeForm
          open
          existing={list}
          onCancel={() => setFormOpen(false)}
          onCreate={(draft) => {
            createChallenge.mutate(draft)
            setFormOpen(false)
            toast(`Челлендж «${draft.name}» заведён`)
          }}
        />
      )}
    </div>
  )
}

function ChallengeRow({ challenge: c }: { challenge: Challenge }) {
  const what =
    c.kind === 'quit'
      ? 'отказ'
      : c.measure === 'count'
        ? `цель ${c.goal.toLocaleString('ru')} ${c.unit ?? ''} в день`
        : 'привычка · галочка за день'

  const term = c.lengthDays
    ? `${c.lengthDays} ${plural(c.lengthDays, 'день', 'дня', 'дней')}`
    : 'бессрочно'

  return (
    <div
      style={{ '--c': c.color } as CSSProperties}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3 px-4',
        c.status !== 'active' && 'opacity-55',
      )}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-[var(--c)] font-mono text-[10px] font-semibold text-white">
        {c.code}
      </span>

      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium">{c.name}</div>
        <div className="font-mono text-[10.5px] text-muted-foreground">
          {what} · {term} · с {formatHuman(parseDay(c.startDate))}
          {c.tag ? ` · «${c.tag}»` : ''}
        </div>
      </div>

      {c.status !== 'active' && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          на паузе
        </span>
      )}
    </div>
  )
}
