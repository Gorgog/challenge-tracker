import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './queryClient'

/* Хранилище — подделка, чьи записи отвечают, когда тест скажет: видно, идут ли записи одна за другой. */
const repo = vi.hoisted(() => {
  const pending: { name: string; resolve: () => void }[] = []
  const call = (name: string) => () => new Promise<void>((resolve) => pending.push({ name, resolve }))
  return {
    pending,
    listChallenges: vi.fn(async () => []),
    reorderChallenges: vi.fn(call('reorder')),
    updateChallenge: vi.fn(call('update')),
    setPaused: vi.fn(call('pause')),
    startDay: vi.fn(async () => {
      throw { code: '23505', message: 'День 2026-09-23 уже начат: утро не правится' }
    }),
  }
})
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

vi.mock('./mode', () => ({ isDemo: () => true }))
vi.mock('./demoRepo', () => ({ createDemoRepo: () => repo }))
vi.mock('./supabaseClient', () => ({ supabase: {} }))
vi.mock('./supabaseRepo', () => ({ createSupabaseRepo: () => ({}) }))

const { useChallenges, useReorderChallenges, useSetPaused, useStartDay, useUpdateChallenge } = await import('./queries')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('записи челленджей идут по очереди, а не наперегонки', () => {
  it('правка, начатая во время перестановки, уходит в хранилище после неё', async () => {
    const { result } = renderHook(() => ({ reorder: useReorderChallenges(), update: useUpdateChallenge(), pause: useSetPaused() }), {
      wrapper,
    })
    act(() => {
      result.current.reorder.mutate(['b', 'a'])
      result.current.update.mutate({ id: 'a', patch: { name: 'А' } })
      result.current.pause.mutate({ id: 'b', paused: true, today: '2026-09-23' })
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    expect(repo.pending.map((p) => p.name)).toEqual(['reorder'])

    act(() => repo.pending[0]!.resolve())
    await waitFor(() => expect(repo.pending.map((p) => p.name)).toEqual(['reorder', 'update']))
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(repo.pending.map((p) => p.name)).toEqual(['reorder', 'update', 'pause']))
  })

  it('список перечитывается после последней записи очереди, а не после первой — иначе правка мигает', async () => {
    repo.pending.length = 0
    const { result } = renderHook(() => ({ list: useChallenges(), update: useUpdateChallenge(), pause: useSetPaused() }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    const reads = () => repo.listChallenges.mock.calls.length
    const before = reads()
    act(() => {
      result.current.pause.mutate({ id: 'a', paused: true, today: '2026-09-23' })
      result.current.update.mutate({ id: 'b', patch: { name: 'Б2' } })
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.resolve())
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    expect(reads()).toBe(before)
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(reads()).toBeGreaterThan(before))
  })
})

describe('ошибка начала дня видна, даже если со страницы уже ушли', () => {
  it('подпись — «Не получилось начать день» с текстом базы', async () => {
    const client = createQueryClient()
    const { result } = renderHook(() => useStartDay(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    act(() => result.current.mutate({ day: '2026-09-23', morning: null, startedAt: '2026-09-23T16:00:00.000Z' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/^Не получилось начать день: День 2026-09-23 уже начат/),
      ),
    )
  })
})
