import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { bedtimeEntries } from '@/domain/bedtime'
import { applyPatch, pause, restore, resume, type ChallengePatch } from '@/domain/challenges'
import { parseDay } from '@/domain/date'
import type { Challenge, DayGroup, DayLog, DayStart, EntryMap, Settings, Tag } from '@/domain/types'
import { createDemoRepo } from './demoRepo'
import { generation } from './queryClient'
import { isDemo } from './mode'
import type { Repo } from './repo'
import { supabase } from './supabaseClient'
import { createSupabaseRepo } from './supabaseRepo'

/**
 * Единственное место, где выбирается хранилище: база (Supabase) или демо в браузере — режим из
 * настроек (`mode.ts`), смена режима перезагружает страницу. Экраны о хранилище не знают.
 */
const demo = isDemo()
const repo: Repo = demo ? createDemoRepo() : createSupabaseRepo(supabase)

/** Хранилище этой страницы — демо? Плашка и настройки смотрят сюда, а не на ключ режима: ключ могли
 *  сменить в другой вкладке, а хранилище выбрано при загрузке. */
export const usingDemo = () => demo

/** Одна очередь на все записи челленджей. */
const CHALLENGES = { id: 'challenges' }

/**
 * Запись очереди челленджей закончилась: перечитать список, но только когда очередь опустела — ответ,
 * пришедший раньше следующей записи, затёр бы её оптимистичную правку. Пропущенное перечитывание —
 * долг, его платит последняя запись. Удачная перестановка без долга список не перечитывает: это рвёт
 * анимацию карточек, а её порядок и так совпадает с базой. В `onSettled` запись ещё считается идущей.
 */
const owed = new WeakMap<QueryClient, boolean>()
function settleQueue(client: QueryClient, refetch: boolean) {
  const last = client.isMutating({ predicate: (m) => m.options.scope?.id === CHALLENGES.id }) <= 1
  if (!last) {
    /* долг — только если этой записи самой нужно перечитывание: две удачные перестановки его не создают */
    if (refetch) owed.set(client, true)
    return
  }
  if (refetch || owed.get(client)) {
    owed.delete(client)
    void client.invalidateQueries({ queryKey: queryKeys.challenges })
  }
}

export const queryKeys = {
  challenges: ['challenges'] as const,
  entries: ['entries'] as const,
  dayLogs: ['dayLogs'] as const,
  dayGroups: ['dayGroups'] as const,
  tags: ['tags'] as const,
  dayStarts: ['dayStarts'] as const,
  settings: ['settings'] as const,
}

export function useChallenges() {
  return useQuery({ queryKey: queryKeys.challenges, queryFn: () => repo.listChallenges() })
}

/**
 * Отметки челленджей. У «Ложусь раньше» (`bedtime`) их нет в хранилище — они считаются из утр
 * (`bedtimeEntries`), поэтому данные есть, только когда пришли и отметки, и челленджи, и начала дней; сбой
 * любого — сбой: без утр «Ложусь раньше» выглядел бы пропущенным. Экраны разницы не видят.
 */
export function useEntries() {
  const stored = useQuery({ queryKey: queryKeys.entries, queryFn: () => repo.listEntries() })
  const challenges = useChallenges()
  const starts = useDayStarts()
  const data = useMemo(() => {
    if (!stored.data || !challenges.data || !starts.data) return undefined
    const bedtime = challenges.data.filter((c) => c.measure === 'bedtime')
    if (!bedtime.length) return stored.data
    const derived = bedtimeEntries(starts.data)
    return { ...stored.data, ...Object.fromEntries(bedtime.map((c) => [c.id, derived])) }
  }, [stored.data, challenges.data, starts.data])
  const all = [stored, challenges, starts]
  return {
    data,
    isPending: data === undefined && all.some((q) => q.isPending),
    isError: all.some((q) => q.isError),
  }
}

export function useDayLogs() {
  return useQuery({ queryKey: queryKeys.dayLogs, queryFn: () => repo.listDayLogs() })
}

export function useDayGroups() {
  return useQuery({ queryKey: queryKeys.dayGroups, queryFn: () => repo.getDayGroups() })
}

export function useDayStarts() {
  return useQuery({ queryKey: queryKeys.dayStarts, queryFn: () => repo.listDayStarts() })
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => repo.getSettings() })
}

/**
 * Начало дня видно сразу, при ошибке откат. Кэш правится до отмены запросов — блюр снимается
 * в том же кадре, что и клик.
 */
export function useStartDay() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (start: DayStart) => repo.startDay(start),
    meta: { errorText: 'Не получилось начать день' },

    onMutate(start) {
      const previous = client.getQueryData<DayStart[]>(queryKeys.dayStarts)
      client.setQueryData<DayStart[]>(queryKeys.dayStarts, (old) => {
        const rest = (old ?? []).filter((s) => s.day !== start.day)
        return [...rest, start].sort((a, b) => a.day.localeCompare(b.day))
      })
      void client.cancelQueries({ queryKey: queryKeys.dayStarts })
      return { previous, gen: generation(client) }
    },

    onError(_error, _start, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.dayStarts, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.dayStarts })
    },
  })
}

export function useSaveSettings() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (settings: Settings) => repo.saveSettings(settings),

    async onMutate(settings) {
      await client.cancelQueries({ queryKey: queryKeys.settings })
      const previous = client.getQueryData<Settings>(queryKeys.settings)
      client.setQueryData<Settings>(queryKeys.settings, settings)
      return { previous, gen: generation(client) }
    },

    onError(_error, _settings, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.settings, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

/** Перетаскивание должно оставлять карточку там, куда её бросили, — поэтому оптимистично. */
export function useReorderChallenges() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (orderedIds: string[]) => repo.reorderChallenges(orderedIds),
    /* записи челленджей — по очереди: иначе перестановка и правка перемешиваются в базе */
    scope: CHALLENGES,

    async onMutate(orderedIds) {
      /* отменяем идущее перечитывание (оно затёрло бы порядок) — но его данные нужны: это долг очереди */
      if (client.isFetching({ queryKey: queryKeys.challenges })) owed.set(client, true)
      await client.cancelQueries({ queryKey: queryKeys.challenges })
      const previous = client.getQueryData<Challenge[]>(queryKeys.challenges)

      client.setQueryData<Challenge[]>(queryKeys.challenges, (old) => {
        if (!old) return old
        const byId = new Map(old.map((c) => [c.id, c]))
        const ordered = orderedIds.flatMap((id) => byId.get(id) ?? [])
        const rest = old.filter((c) => !orderedIds.includes(c.id))
        return [...ordered, ...rest].map((c, i) => ({ ...c, sortOrder: i }))
      })

      return { previous, gen: generation(client) }
    },

    onError(_error, _ids, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.challenges, context.previous)
    },

    /*
     * После удачной перестановки перечитывания нет намеренно: оно перерисовывало список и рвало
     * анимацию возврата карточки, а оптимистичный порядок совпадает с базой. После ошибки или
     * с долгом очереди — перечитать: откат мог вернуть снимок с чужой отменённой правкой.
     */
    onSettled(_data, error) {
      settleQueue(client, error !== null)
    },
  })
}

export function useSaveDayGroups() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (groups: DayGroup[]) => repo.saveDayGroups(groups),

    async onMutate(groups) {
      await client.cancelQueries({ queryKey: queryKeys.dayGroups })
      const previous = client.getQueryData<DayGroup[]>(queryKeys.dayGroups)
      client.setQueryData<DayGroup[]>(queryKeys.dayGroups, groups)
      return { previous, gen: generation(client) }
    },

    onError(_error, _groups, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.dayGroups, context.previous)
    },

    /* Инвалидации нет по той же причине, что и у порядка челленджей. */
  })
}

export function useCreateChallenge() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (challenge: Omit<Challenge, 'id'>) => repo.createChallenge(challenge),
    /* записи челленджей — по очереди: иначе перестановка и правка перемешиваются в базе */
    scope: CHALLENGES,
    onSuccess() {
      void client.invalidateQueries({ queryKey: queryKeys.entries })
    },
    onSettled() {
      settleQueue(client, true)
    },
  })
}

export type SetEntryArgs = {
  challengeId: string
  day: string
  /** `undefined` снимает отметку: пустота и ноль — разные состояния. */
  value: number | undefined
}

/** Отметка применяется на экране сразу, до ответа хранилища, и откатывается при ошибке. */
export function useSetEntry() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ challengeId, day, value }: SetEntryArgs) =>
      repo.setEntry(challengeId, day, value),

    async onMutate({ challengeId, day, value }) {
      await client.cancelQueries({ queryKey: queryKeys.entries })
      const previous = client.getQueryData<Record<string, EntryMap>>(queryKeys.entries)

      client.setQueryData<Record<string, EntryMap>>(queryKeys.entries, (old) => {
        const next = { ...(old ?? {}) }
        const map = { ...(next[challengeId] ?? {}) }
        if (value === undefined) delete map[day]
        else map[day] = value
        next[challengeId] = map
        return next
      })

      return { previous, gen: generation(client) }
    },

    onError(_error, _args, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.entries, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.entries })
    },
  })
}

export function useSaveDayLog() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (log: DayLog) => repo.saveDayLog(log),

    async onMutate(log) {
      await client.cancelQueries({ queryKey: queryKeys.dayLogs })
      const previous = client.getQueryData<DayLog[]>(queryKeys.dayLogs)

      client.setQueryData<DayLog[]>(queryKeys.dayLogs, (old) => {
        const rest = (old ?? []).filter((l) => l.day !== log.day)
        return [...rest, log].sort((a, b) => a.day.localeCompare(b.day))
      })

      return { previous, gen: generation(client) }
    },

    onError(_error, _log, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.dayLogs, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.dayLogs })
    },
  })
}

/**
 * Правка одного челленджа: кэш меняется сразу, при ошибке откатывается.
 * Кэш правится до отмены запросов — так правка видна в том же кадре, что и клик.
 */
function useChallengeMutation<Args>(
  run: (args: Args) => Promise<void>,
  optimistic: (list: Challenge[], args: Args) => Challenge[],
) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    /* записи челленджей — по очереди: иначе перестановка и правка перемешиваются в базе */
    scope: CHALLENGES,

    onMutate(args: Args) {
      const previous = client.getQueryData<Challenge[]>(queryKeys.challenges)
      client.setQueryData<Challenge[]>(queryKeys.challenges, (old) =>
        old ? optimistic(old, args) : old,
      )
      void client.cancelQueries({ queryKey: queryKeys.challenges })
      return { previous, gen: generation(client) }
    },

    onError(_error, _args, context) {
      if (context?.previous && context.gen === generation(client)) client.setQueryData(queryKeys.challenges, context.previous)
    },

    onSettled() {
      settleQueue(client, true)
    },
  })
}

const patchOne = (list: Challenge[], id: string, change: (c: Challenge) => Challenge) =>
  list.map((c) => (c.id === id ? change(c) : c))

export function useUpdateChallenge() {
  return useChallengeMutation(
    ({ id, patch }: { id: string; patch: ChallengePatch }) => repo.updateChallenge(id, patch),
    (list, { id, patch }) => patchOne(list, id, (c) => applyPatch(c, patch)),
  )
}

/**
 * `today` приходит снаружи, чтобы кэш и хранилище посчитали паузу от одного и того же дня.
 * Отметки и итоги дней берутся из кэша — страница, откуда зовут паузу, должна быть на них подписана.
 */
export function useSetPaused() {
  const client = useQueryClient()
  return useChallengeMutation(
    ({ id, paused, today }: { id: string; paused: boolean; today: string }) =>
      repo.setPaused(id, paused, today),
    (list, { id, paused, today }) => {
      const day = parseDay(today)
      const entries = client.getQueryData<Record<string, EntryMap>>(queryKeys.entries)?.[id] ?? {}
      const closed = Boolean(
        client.getQueryData<DayLog[]>(queryKeys.dayLogs)?.some((l) => l.day === today && l.closedAt),
      )
      return patchOne(list, id, (c) => (paused ? pause(c, entries, day, closed) : resume(c, day, closed)))
    },
  )
}

export function useDeleteChallenge() {
  return useChallengeMutation(
    (id: string) => repo.deleteChallenge(id),
    (list, id) => patchOne(list, id, (c) => ({ ...c, deletedAt: new Date().toISOString() })),
  )
}

/** Как и пауза: `today` приходит снаружи, итоги дней берутся из кэша — страница на них подписана. */
export function useRestoreChallenge() {
  const client = useQueryClient()
  return useChallengeMutation(
    ({ id, today }: { id: string; today: string }) => repo.restoreChallenge(id, today),
    (list, { id, today }) => {
      const closed = Boolean(
        client.getQueryData<DayLog[]>(queryKeys.dayLogs)?.some((l) => l.day === today && l.closedAt),
      )
      return patchOne(list, id, (c) => restore(c, parseDay(today), closed))
    },
  )
}

/** Навсегда — без оптимизма: действие необратимое, пусть экран покажет его по факту. */
export function usePurgeChallenge() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => repo.purgeChallenge(id),
    /* записи челленджей — по очереди: иначе перестановка и правка перемешиваются в базе */
    scope: CHALLENGES,
    onSuccess() {
      void client.invalidateQueries({ queryKey: queryKeys.entries })
    },
    onSettled() {
      settleQueue(client, true)
    },
  })
}

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => repo.listTags() })
}

/** Ошибку (пустое имя, дубль) хук не глотает: её показывает форма. */
export function useCreateTag() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => repo.createTag(name),
    meta: { ownError: true },
    onSuccess(tag) {
      /* Сразу в кэш: тег, созданный из выбора, должен появиться чипом, не дожидаясь перечитывания. */
      client.setQueryData<Tag[]>(queryKeys.tags, (old) =>
        [...(old ?? []), tag].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      )
      void client.invalidateQueries({ queryKey: queryKeys.tags })
    },
  })
}

export function useDeleteTag() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => repo.deleteTag(id),
    /* записи челленджей — по очереди: иначе перестановка и правка перемешиваются в базе */
    scope: CHALLENGES,
    onSuccess() {
      void client.invalidateQueries({ queryKey: queryKeys.tags })
    },
    /* Тег снимается со всех челленджей — их тоже надо перечитать. */
    onSettled() {
      settleQueue(client, true)
    },
  })
}
