import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient, resetCache } from './queryClient'

/* Хранилище — подделка, чьи записи отвечают, когда тест скажет: видно, идут ли записи одна за другой. */
const repo = vi.hoisted(() => {
  const pending: { name: string; resolve: (v?: unknown) => void; reject: (e: unknown) => void }[] = []
  const call = (name: string) => () =>
    new Promise<never>((resolve, reject) => pending.push({ name, resolve: resolve as (v?: unknown) => void, reject }))
  return {
    pending,
    /* перечитывание можно задержать: slowList — ответ списка ждёт, пока тест не отпустит */
    slowList: null as null | { release: () => void },
    listChallenges: vi.fn(function (this: unknown) {
      return new Promise<never[]>((resolve) => {
        if (repo.slowList) repo.slowList.release = () => resolve([])
        else resolve([])
      })
    }),
    reorderChallenges: vi.fn(call('reorder')),
    updateChallenge: vi.fn(call('update')),
    setPaused: vi.fn(call('pause')),
    createChallenge: vi.fn(call('create')),
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

const { useChallenges, useCreateChallenge, useReorderChallenges, useSetPaused, useStartDay, useUpdateChallenge } =
  await import('./queries')

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

describe('очередь заканчивается перечитыванием, если в ней было что-то кроме удачной перестановки', () => {
  async function queue(run: (h: ReturnType<typeof useHooks>) => void) {
    repo.pending.length = 0
    repo.slowList = null
    const { result } = renderHook(useHooks, { wrapper })
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    const before = repo.listChallenges.mock.calls.length
    act(() => run(result.current))
    return { before, reads: () => repo.listChallenges.mock.calls.length }
  }
  const useHooks = () => ({
    list: useChallenges(),
    create: useCreateChallenge(),
    update: useUpdateChallenge(),
    reorder: useReorderChallenges(),
  })
  const draft = { name: 'Новый', code: 'НВ' } as never

  it('завёл и сразу переставил — новый челлендж подтягивается', async () => {
    const q = await queue((h) => {
      h.create.mutate(draft)
      h.reorder.mutate(['b', 'a'])
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.resolve({ id: 'new' }))
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(q.reads()).toBeGreaterThan(q.before))
  })

  it('правка упала, перестановка прошла — список перечитан, а не остался с отменённым', async () => {
    const q = await queue((h) => {
      h.update.mutate({ id: 'a', patch: { name: 'А2' } })
      h.reorder.mutate(['b', 'a'])
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.reject(new Error('нет сети')))
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(q.reads()).toBeGreaterThan(q.before))
  })

  it('перестановка упала — список перечитан', async () => {
    const q = await queue((h) => h.reorder.mutate(['b', 'a']))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.reject(new Error('нет сети')))
    await waitFor(() => expect(q.reads()).toBeGreaterThan(q.before))
  })

  it('две удачные перестановки подряд — тоже без перечитывания', async () => {
    const q = await queue((h) => {
      h.reorder.mutate(['b', 'a'])
      h.reorder.mutate(['a', 'b'])
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.resolve())
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    act(() => repo.pending[1]!.resolve())
    await new Promise((r) => setTimeout(r, 50))
    expect(q.reads()).toBe(q.before)
  })

  it('перестановка, отменившая идущее перечитывание, сама его повторяет', async () => {
    let h!: ReturnType<typeof useHooks>
    const q = await queue((hooks) => {
      h = hooks
      hooks.create.mutate({ name: 'Новый', code: 'НВ' } as never)
    })
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    /* перечитывание после создания зависнет — его отменит перестановка */
    repo.slowList = { release: () => {} }
    act(() => repo.pending[0]!.resolve({ id: 'new' }))
    await waitFor(() => expect(q.reads()).toBe(q.before + 1))
    act(() => h.reorder.mutate(['b', 'a']))
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    repo.slowList = null
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(q.reads()).toBe(q.before + 2))
  })

  it('одна удачная перестановка — без перечитывания: оно рвёт анимацию карточек', async () => {
    const q = await queue((h) => h.reorder.mutate(['b', 'a']))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.resolve())
    await new Promise((r) => setTimeout(r, 50))
    expect(q.reads()).toBe(q.before)
  })
})

describe('выход во время записи: откат не возвращает данные прошлого пользователя', () => {
  it('кэш очищен, запись упала — в кэше пусто, а не снимок прошлого пользователя', async () => {
    repo.pending.length = 0
    const client = new QueryClient()
    client.setQueryData(['challenges'], [{ id: 'a', name: 'данные А', pauses: [], tagIds: [] }])
    const { result } = renderHook(() => useUpdateChallenge(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    act(() => result.current.mutate({ id: 'a', patch: { name: 'А2' } }))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => resetCache(client))
    act(() => repo.pending[0]!.reject(new Error('нет сети')))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData(['challenges'])).toBeUndefined()
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
