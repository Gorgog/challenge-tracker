import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Challenge, DayGroup, DayLog, EntryMap } from '@/domain/types'
import { createDemoRepo } from './demoRepo'
import type { Repo } from './repo'

/**
 * Единственное место, где выбирается хранилище. Когда появится схема в Supabase,
 * здесь меняется одна строка — экраны не трогаются.
 */
const repo: Repo = createDemoRepo()

export const queryKeys = {
  challenges: ['challenges'] as const,
  entries: ['entries'] as const,
  dayLogs: ['dayLogs'] as const,
  dayGroups: ['dayGroups'] as const,
}

export function useChallenges() {
  return useQuery({ queryKey: queryKeys.challenges, queryFn: () => repo.listChallenges() })
}

export function useEntries() {
  return useQuery({ queryKey: queryKeys.entries, queryFn: () => repo.listEntries() })
}

export function useDayLogs() {
  return useQuery({ queryKey: queryKeys.dayLogs, queryFn: () => repo.listDayLogs() })
}

export function useDayGroups() {
  return useQuery({ queryKey: queryKeys.dayGroups, queryFn: () => repo.getDayGroups() })
}

/** Перетаскивание должно оставлять карточку там, куда её бросили, — поэтому оптимистично. */
export function useReorderChallenges() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (orderedIds: string[]) => repo.reorderChallenges(orderedIds),

    async onMutate(orderedIds) {
      await client.cancelQueries({ queryKey: queryKeys.challenges })
      const previous = client.getQueryData<Challenge[]>(queryKeys.challenges)

      client.setQueryData<Challenge[]>(queryKeys.challenges, (old) => {
        if (!old) return old
        const byId = new Map(old.map((c) => [c.id, c]))
        const ordered = orderedIds.flatMap((id) => byId.get(id) ?? [])
        const rest = old.filter((c) => !orderedIds.includes(c.id))
        return [...ordered, ...rest].map((c, i) => ({ ...c, sortOrder: i }))
      })

      return { previous }
    },

    onError(_error, _ids, context) {
      if (context?.previous) client.setQueryData(queryKeys.challenges, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.challenges })
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
      return { previous }
    },

    onError(_error, _groups, context) {
      if (context?.previous) client.setQueryData(queryKeys.dayGroups, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.dayGroups })
    },
  })
}

export function useCreateChallenge() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (challenge: Omit<Challenge, 'id'>) => repo.createChallenge(challenge),
    onSuccess() {
      void client.invalidateQueries({ queryKey: queryKeys.challenges })
      void client.invalidateQueries({ queryKey: queryKeys.entries })
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

      return { previous }
    },

    onError(_error, _args, context) {
      if (context?.previous) client.setQueryData(queryKeys.entries, context.previous)
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

      return { previous }
    },

    onError(_error, _log, context) {
      if (context?.previous) client.setQueryData(queryKeys.dayLogs, context.previous)
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: queryKeys.dayLogs })
    },
  })
}
