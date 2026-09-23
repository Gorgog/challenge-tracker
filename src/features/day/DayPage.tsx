import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import {
  useChallenges,
  useDayGroups,
  useDayLogs,
  useDayStarts,
  useEntries,
  useReorderChallenges,
  useSaveDayGroups,
  useSaveDayLog,
  useSetEntry,
  useSettings,
  useStartDay,
} from '@/data/queries'
import { DOW_FULL, dayKey, formatHuman, isoDow, parseDay, todayKey } from '@/domain/date'
import { onDay } from '@/domain/challenges'
import { dayStage, morningOpen } from '@/domain/dayStart'
import { unratedDays } from '@/domain/stats'
import { currentStreak, dayOutcome } from '@/domain/streaks'
import {
  DEFAULT_DAY_GROUPS,
  DEFAULT_SETTINGS,
  type Challenge,
  type DayGroup,
  type DayLog,
  type EntryMap,
  type Morning,
} from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import { DayCloseDialog } from './DayCloseDialog'
import { DayStartDialog } from './DayStartDialog'
import { SortableGroup, SortableRow } from './Sortable'
import { groupId, groupOf } from './groups'
import { HoldCard } from './HoldCard'
import { TaskRow } from './TaskRow'
import { useClock } from './useClock'

/* Стабильная пустая ссылка: иначе useMemo ниже пересчитывался бы каждый рендер. */
const NO_CHALLENGES: Challenge[] = []

/**
 * Столько «Завершить день» не срабатывает после начала дня: кнопка появляется на месте «Начать
 * день», и двойное нажатие открыло бы окно итога, которое нельзя закрыть.
 */
const START_GRACE_MS = 1000

const SCORE_LABELS: { field: keyof Pick<DayLog, 'mood' | 'wellbeing' | 'productivity'>; label: string }[] = [
  { field: 'mood', label: 'Настроение' },
  { field: 'wellbeing', label: 'Самочувствие' },
  { field: 'productivity', label: 'Продуктивность' },
]

export function DayPage() {
  const { now, refresh } = useClock()
  const todayK = dayKey(now)
  const today = useMemo(() => parseDay(todayK), [todayK])

  const challenges = useChallenges()
  const entriesQuery = useEntries()
  const logsQuery = useDayLogs()
  const dayGroupsQuery = useDayGroups()
  const setEntry = useSetEntry()
  const saveDayLog = useSaveDayLog()
  const reorderChallenges = useReorderChallenges()
  const saveDayGroups = useSaveDayGroups()
  const startsQuery = useDayStarts()
  const settingsQuery = useSettings()
  const startDay = useStartDay()

  const sensors = useSensors(
    /* Порог в 4 пикселя: без него клик по ручке уже считался бы перетаскиванием. */
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const [dialogDay, setDialogDay] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  /** Когда день начат на этой странице — для паузы у «Завершить день». */
  const [startedMs, setStartedMs] = useState(0)

  /*
   * Порядок после броска применяется здесь, синхронно, а не ждёт мутацию:
   * иначе на один кадр трансформации уже сброшены, а список ещё в старом порядке,
   * и карточки успевают мигнуть на прежних местах.
   */
  const [rowOrder, setRowOrder] = useState<string[] | null>(null)
  const [groupOrder, setGroupOrder] = useState<DayGroup[] | null>(null)

  const entries = entriesQuery.data ?? {}
  const logs = logsQuery.data ?? []
  const fetched = challenges.data ?? NO_CHALLENGES

  const allChallenges = useMemo(() => {
    if (!rowOrder) return fetched
    const byId = new Map(fetched.map((c) => [c.id, c]))
    const known = rowOrder.flatMap((id) => byId.get(id) ?? [])
    const rest = fetched.filter((c) => !rowOrder.includes(c.id))
    return [...known, ...rest]
  }, [fetched, rowOrder])

  const active = allChallenges.filter(onDay)
  const tasks = active.filter((c) => c.kind === 'do')
  const holds = active.filter((c) => c.kind === 'quit')

  const entriesOf = (c: Challenge): EntryMap => entries[c.id] ?? {}
  const isDone = (c: Challenge) => dayOutcome(c, entriesOf(c), today, today) === 'hit'
  const streakOf = (c: Challenge) => currentStreak(c, entriesOf(c), today)

  const doneCount = tasks.filter(isDone).length
  const pendingCount = tasks.length - doneCount
  const starts = startsQuery.data ?? []
  /* первый день пользования: самое раннее из стартов челленджей, начал дней и итогов */
  const since = [...fetched.map((c) => c.startDate), ...starts.map((s) => s.day), ...logs.map((l) => l.day)].reduce<
    string | null
  >((min, d) => (min === null || d < min ? d : min), null)
  const debt = unratedDays(logs, today, 14, since ?? todayK)
  const todayLog = logs.find((l) => l.day === todayK) ?? null
  /* Закрытый день не правится задним числом: иначе оценка перестаёт что-либо значить. */
  const frozen = Boolean(todayLog)
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS
  const todayStart = starts.find((s) => s.day === todayK) ?? null
  /* Не начатый день тоже под блюром: отметки — только после начала, утро — до дел дня. */
  const notStarted = dayStage(todayK, starts, logs) === 'notStarted'
  const locked = frozen || notStarted
  const morningNow = morningOpen(now, settings.morningUntil)

  /**
   * Утро записывается один раз и не правится. День и час сверяются в момент записи: страница могла
   * простоять открытой с вечера — новый день не пишется под вчерашним; окно утра могли открыть до
   * утреннего часа, а отправить после — тогда это уже не утро.
   */
  const start = (morning: Morning | null) => {
    setStartOpen(false)
    if (todayKey() !== todayK) {
      refresh()
      return
    }
    if (startDay.isPending) return
    const late = morning !== null && !morningOpen(new Date(), settings.morningUntil)
    const recorded = late ? null : morning
    setStartedMs(Date.now())
    startDay.mutate(
      { day: todayK, morning: recorded, startedAt: new Date().toISOString() },
      {
        onSuccess: () =>
          toast(
            recorded
              ? 'День начат'
              : late
                ? 'Утро уже прошло — день начат без утренних оценок'
                : 'День начат без утренних оценок',
          ),
        /* ошибку показывает хук (meta.errorText): её видно, даже если со страницы уже ушли */
      },
    )
  }

  /* Час проверяется в момент нажатия: плашка могла устареть с утра. */
  const beginDay = () => {
    if (todayKey() !== todayK) {
      refresh()
      return
    }
    if (morningOpen(new Date(), settings.morningUntil)) setStartOpen(true)
    else start(null)
  }

  const finishDay = () => {
    if (Date.now() - startedMs < START_GRACE_MS) return
    setDialogDay(todayK)
  }

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

  const groups = groupOrder ?? dayGroupsQuery.data ?? DEFAULT_DAY_GROUPS
  const shownGroups = groups.filter((g) => (g === 'tasks' ? tasks : holds).length > 0)

  /** Перестановка блоков между собой. */
  const onGroupDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return
    const from = groups.indexOf(groupOf(String(dragged.id)) as DayGroup)
    const to = groups.indexOf(groupOf(String(over.id)) as DayGroup)
    if (from < 0 || to < 0) return

    const next = arrayMove(groups, from, to)
    setGroupOrder(next)
    /* и при ошибке: кэш откатился — экран тоже возвращается к прежнему порядку */
    saveDayGroups.mutate(next, { onSettled: () => setGroupOrder(null) })
  }

  /** Перестановка карточек внутри блока. Между блоками они не ходят: контексты разные. */
  const onRowDragEnd = (group: DayGroup, { active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return

    const groupIds = (group === 'tasks' ? tasks : holds).map((c) => c.id)
    const from = groupIds.indexOf(String(dragged.id))
    const to = groupIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return

    const moved = arrayMove(groupIds, from, to)
    /* Челленджи из другого блока остаются на своих местах в общем порядке. */
    let next = 0
    const fullOrder = allChallenges.map((c) => (groupIds.includes(c.id) ? moved[next++]! : c.id))

    setRowOrder(fullOrder)
    reorderChallenges.mutate(fullOrder, { onSettled: () => setRowOrder(null) })
  }

  /* Цифра отмечает задачу по её номеру в списке — как в прототипе. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || dialogDay || startOpen || e.ctrlKey || e.metaKey || e.altKey) return
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

  /*
   * Не загрузилось — ничего не показываем: по пустым отметкам и итогам экран записал бы поверх (цель вместо
   * 35, заново оценённый день без заметки). Пока грузится — тоже: и не «не начат», и не «14 дней без оценки».
   */
  const queries = [challenges, entriesQuery, logsQuery, startsQuery, settingsQuery]
  if (queries.some((q) => q.isError && q.data === undefined)) {
    return (
      <div role="alert" className="mx-auto m-8 max-w-md rounded-xl border border-destructive/40 p-6 text-center text-sm">
        Не удалось загрузить данные дня — отметки не показываю, чтобы не записать поверх. Обнови страницу.
      </div>
    )
  }
  if (queries.some((q) => q.isPending)) {
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
        {todayStart && (
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {todayStart.morning
              ? `Утро: сон ${todayStart.morning.sleep} · самочувствие ${todayStart.morning.wellbeing} · настроение ${todayStart.morning.mood}`
              : 'Утро без оценок'}
          </p>
        )}
      </div>

      <div className="relative">
      <div className={cn(locked && 'pointer-events-none select-none opacity-70 blur-[2.5px]')}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onGroupDragEnd}
      >
        <SortableContext items={shownGroups.map(groupId)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {shownGroups.map((group) =>
              group === 'tasks' ? (
                <SortableGroup key="tasks" group="tasks" title="Отмечаю сам">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    onDragEnd={(event) => onRowDragEnd('tasks', event)}
                  >
                    <SortableContext
                      items={tasks.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-2">
                        {tasks.map((c, i) => (
                          <SortableRow key={c.id} id={c.id} label={`Переставить: ${c.name}`}>
                            <TaskRow
                              challenge={c}
                              value={entriesOf(c)[todayK]}
                              done={isDone(c)}
                              streak={streakOf(c)}
                              index={i + 1}
                              frozen={locked}
                              onToggle={() => toggleTask(c)}
                              onSetValue={(value) =>
                                setEntry.mutate({ challengeId: c.id, day: todayK, value })
                              }
                            />
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </SortableGroup>
              ) : (
                <SortableGroup key="holds" group="holds" title="Идут сами">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToParentElement]}
                    onDragEnd={(event) => onRowDragEnd('holds', event)}
                  >
                    <SortableContext items={holds.map((c) => c.id)} strategy={rectSortingStrategy}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {holds.map((c) => (
                          <SortableRow key={c.id} id={c.id} label={`Переставить: ${c.name}`}>
                            <HoldCard
                              challenge={c}
                              failed={entriesOf(c)[todayK] === 0}
                              streak={streakOf(c)}
                              frozen={locked}
                              onToggleRelapse={() => toggleRelapse(c)}
                            />
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </SortableGroup>
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>
      </div>

        {locked && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="rounded-xl border border-border bg-card/95 px-5 py-3 text-center shadow-lg">
              <div className="text-[15px] font-semibold">{frozen ? 'День закрыт' : 'День не начат'}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {frozen
                  ? 'Отметки заморожены до завтра. Поменять можно только оценку.'
                  : morningNow
                    ? 'Три коротких вопроса: сон, самочувствие, настроение — можно пропустить.'
                    : `Утренние вопросы — до ${settings.morningUntil}:00. Сейчас день начнётся без них.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Разные ключи: новая кнопка не наследует фокус прежней, и второй Enter никуда не попадёт. */}
      {todayLog ? (
        <div key="closed" className="flex flex-col gap-3 rounded-xl border border-good/35 bg-good/5 px-4 py-4">
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
      ) : notStarted ? (
        <div key="start" className="flex flex-col items-center gap-2 py-1">
          <Button size="lg" onClick={beginDay}>
            Начать день
          </Button>
          <span className="text-center text-xs text-muted-foreground">
            {morningNow
              ? 'Спросит сон, самочувствие и настроение. Можно пропустить.'
              : 'Утро уже прошло — день начнётся без вопросов.'}
          </span>
        </div>
      ) : (
        <div key="finish" className="flex flex-col items-center gap-2 py-1">
          <Button size="lg" onClick={finishDay}>
            Завершить день
          </Button>
          <span className="text-center text-xs text-muted-foreground">
            Спросит настроение, самочувствие и продуктивность.
            <br />
            Незакрытые задачи останутся пропусками.
          </span>
        </div>
      )}

      {startOpen && (
        <DayStartDialog
          open
          day={todayK}
          onStart={(morning) => start(morning)}
          onSkip={() => start(null)}
          onCancel={() => setStartOpen(false)}
        />
      )}

      {dialogDay && (
        <DayCloseDialog
          key={dialogDay}
          open
          day={dialogDay}
          existing={logs.find((l) => l.day === dialogDay) ?? null}
          pendingCount={dialogDay === todayK ? pendingCount : 0}
          onSave={(log) => {
            /* окно закрывается, когда база приняла итог: при отказе оценки, заметка и теги остаются в окне */
            saveDayLog.mutate(log, {
              onSuccess: () => {
                setDialogDay(null)
                toast(log.day === todayK ? 'День закрыт' : `День ${formatHuman(parseDay(log.day))} оценён`)
              },
            })
          }}
          onCancel={
            logs.some((l) => l.day === dialogDay) ? () => setDialogDay(null) : undefined
          }
        />
      )}
    </div>
  )
}
