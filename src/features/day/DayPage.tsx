import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useChallenges, useDayLogs, useEntries, useSaveDayLog, useSetEntry } from '@/data/queries'
import { DOW_FULL, dayKey, formatHuman, isoDow, parseDay, todayKey } from '@/domain/date'
import { unratedDays } from '@/domain/stats'
import { currentStreak, dayOutcome } from '@/domain/streaks'
import type { Challenge, DayLog, EntryMap } from '@/domain/types'
import { plural } from '@/lib/plural'
import { DayCloseDialog } from './DayCloseDialog'
import { HoldCard } from './HoldCard'
import { TaskRow } from './TaskRow'

const SCORE_LABELS: { field: keyof Pick<DayLog, 'mood' | 'wellbeing' | 'productivity'>; label: string }[] = [
  { field: 'mood', label: 'Настроение' },
  { field: 'wellbeing', label: 'Самочувствие' },
  { field: 'productivity', label: 'Продуктивность' },
]

export function DayPage() {
  const today = useMemo(() => parseDay(todayKey()), [])
  const todayK = dayKey(today)

  const challenges = useChallenges()
  const entriesQuery = useEntries()
  const logsQuery = useDayLogs()
  const setEntry = useSetEntry()
  const saveDayLog = useSaveDayLog()

  const [dialogDay, setDialogDay] = useState<string | null>(null)

  const entries = entriesQuery.data ?? {}
  const logs = logsQuery.data ?? []
  const active = (challenges.data ?? []).filter((c) => c.status === 'active')
  const tasks = active.filter((c) => c.kind === 'do')
  const holds = active.filter((c) => c.kind === 'quit')

  const entriesOf = (c: Challenge): EntryMap => entries[c.id] ?? {}
  const isDone = (c: Challenge) => dayOutcome(c, entriesOf(c), today, today) === 'hit'
  const streakOf = (c: Challenge) => currentStreak(c, entriesOf(c), today)

  const doneCount = tasks.filter(isDone).length
  const pendingCount = tasks.length - doneCount
  const debt = unratedDays(logs, today)
  const todayLog = logs.find((l) => l.day === todayK) ?? null
  /* Закрытый день не правится задним числом: иначе оценка перестаёт что-либо значить. */
  const frozen = Boolean(todayLog)

  /** Отметка применяется сразу, тост даёт вернуть прежнее значение. */
  const applyEntry = (c: Challenge, day: string, value: number | undefined, message: string) => {
    const previous = entriesOf(c)[day]
    setEntry.mutate({ challengeId: c.id, day, value })
    toast(message, {
      action: {
        label: 'Отменить',
        onClick: () => setEntry.mutate({ challengeId: c.id, day, value: previous }),
      },
    })
  }

  const toggleTask = (c: Challenge) => {
    const done = isDone(c)
    /* Снятая отметка — это отсутствие записи, а не ноль. */
    const value = done ? undefined : c.measure === 'binary' ? 1 : c.goal
    applyEntry(c, todayK, value, done ? 'Отметка снята' : `Отмечено: ${c.name}`)
  }

  const toggleRelapse = (c: Challenge) => {
    const failed = entriesOf(c)[todayK] === 0
    applyEntry(
      c,
      todayK,
      failed ? undefined : 0,
      failed ? 'Срыв убран' : 'Срыв записан — серия обнулена',
    )
  }

  /* Цифра отмечает задачу по её номеру в списке — как в прототипе. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (frozen || dialogDay || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (!/^[1-9]$/.test(e.key)) return
      const task = tasks[Number(e.key) - 1]
      if (task) {
        e.preventDefault()
        toggleTask(task)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (challenges.isPending) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Загружаю…</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      {debt.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warn/45 bg-warn/15 px-3 py-2.5 text-[12.5px]">
          <span>
            <b>
              {debt.length} {plural(debt.length, 'день', 'дня', 'дней')} без оценки
            </b>{' '}
            — самый ранний {formatHuman(parseDay(debt[0]!))}.
          </span>
          <Button size="sm" onClick={() => setDialogDay(debt[0]!)}>
            Оценить {formatHuman(parseDay(debt[0]!))}
          </Button>
        </div>
      )}

      <div className="pt-1 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Сегодня</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {DOW_FULL[isoDow(today)]}, {formatHuman(today)} · {doneCount} из {tasks.length}{' '}
          {plural(tasks.length, 'задачи', 'задач', 'задач')} закрыто
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((c, i) => (
          <TaskRow
            key={c.id}
            challenge={c}
            value={entriesOf(c)[todayK]}
            done={isDone(c)}
            streak={streakOf(c)}
            index={i + 1}
            frozen={frozen}
            onToggle={() => toggleTask(c)}
            onSetValue={(value) => setEntry.mutate({ challengeId: c.id, day: todayK, value })}
          />
        ))}
      </div>

      {holds.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {holds.map((c) => (
            <HoldCard
              key={c.id}
              challenge={c}
              failed={entriesOf(c)[todayK] === 0}
              streak={streakOf(c)}
              frozen={frozen}
              onToggleRelapse={() => toggleRelapse(c)}
            />
          ))}
        </div>
      )}

      {todayLog ? (
        <div className="flex flex-col gap-3 rounded-xl border border-good/35 bg-good/5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-5">
              {SCORE_LABELS.map((s) => (
                <div key={s.field}>
                  <b className="font-mono text-xl font-semibold tracking-tight">
                    {todayLog[s.field]}
                  </b>
                  <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialogDay(todayK)}>
              Изменить оценку
            </Button>
          </div>

          <p className="text-[11.5px] text-muted-foreground">
            День закрыт — отметки заморожены. Поменять можно только оценку.
          </p>

          {todayLog.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {todayLog.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-input bg-secondary px-2.5 py-0.5 text-[11.5px] text-secondary-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {todayLog.note && (
            <p className="border-l-2 border-input pl-3 text-[13px] text-secondary-foreground">
              {todayLog.note}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-1">
          <Button size="lg" onClick={() => setDialogDay(todayK)}>
            Завершить день
          </Button>
          <span className="text-center text-xs text-muted-foreground">
            Спросит настроение, самочувствие и продуктивность.
            <br />
            Незакрытые задачи останутся пропусками.
          </span>
        </div>
      )}

      {dialogDay && (
        <DayCloseDialog
          key={dialogDay}
          open
          day={dialogDay}
          existing={logs.find((l) => l.day === dialogDay) ?? null}
          pendingCount={dialogDay === todayK ? pendingCount : 0}
          onSave={(log) => {
            saveDayLog.mutate(log)
            setDialogDay(null)
            toast(log.day === todayK ? 'День закрыт' : `День ${formatHuman(parseDay(log.day))} оценён`)
          }}
          onCancel={
            logs.some((l) => l.day === dialogDay) ? () => setDialogDay(null) : undefined
          }
        />
      )}
    </div>
  )
}
