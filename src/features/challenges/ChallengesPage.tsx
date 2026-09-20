import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  useChallenges,
  useCreateChallenge,
  useDeleteChallenge,
  usePurgeChallenge,
  useRestoreChallenge,
  useSetChallengeStatus,
  useTags,
} from '@/data/queries'
import { isLive } from '@/domain/challenges'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'
import { ChallengeForm } from './ChallengeForm'
import { ChallengeRow } from './ChallengeRow'
import { DeletedChallenges } from './DeletedChallenges'

export function ChallengesPage() {
  const challenges = useChallenges()
  const tags = useTags()
  const createChallenge = useCreateChallenge()
  const setStatus = useSetChallengeStatus()
  const deleteChallenge = useDeleteChallenge()
  const restoreChallenge = useRestoreChallenge()
  const purgeChallenge = usePurgeChallenge()
  const [formOpen, setFormOpen] = useState(false)

  const all = challenges.data ?? []
  /* Удалённые уходят из списка, но статистика их помнит. */
  const list = all.filter(isLive)
  const trash = all.filter((c) => !isLive(c))
  const tagName = new Map((tags.data ?? []).map((t) => [t.id, t.name]))
  const namesOf = (c: Challenge) => c.tagIds.flatMap((id) => tagName.get(id) ?? [])

  const remove = (c: Challenge) => {
    deleteChallenge.mutate(c.id)
    toast(`«${c.name}» в удалённых`, {
      action: { label: 'Вернуть', onClick: () => restoreChallenge.mutate(c.id) },
    })
  }

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
            <ChallengeRow
              key={c.id}
              challenge={c}
              tagNames={namesOf(c)}
              onToggleStatus={() =>
                setStatus.mutate({ id: c.id, status: c.status === 'paused' ? 'active' : 'paused' })
              }
              onDelete={() => remove(c)}
            />
          ))}
        </div>
      )}

      <DeletedChallenges
        challenges={trash}
        onRestore={(id) => restoreChallenge.mutate(id)}
        onPurge={(id) => {
          const name = trash.find((c) => c.id === id)?.name
          purgeChallenge.mutate(id)
          toast(`«${name}» удалён навсегда`)
        }}
      />

      {formOpen && (
        <ChallengeForm
          open
          /* Все, включая удалённые: вернувшийся челлендж не должен совпасть по цвету с новым. */
          existing={all}
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
