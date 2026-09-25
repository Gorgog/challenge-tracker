import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterAll, describe, expect, it, vi } from 'vitest'
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
    listEntries: vi.fn(async () => ({}) as Record<string, Record<string, number>>),
    listDayStarts: vi.fn(async () => [] as unknown[]),
    setEntry: vi.fn((...args: unknown[]) => call(`entry ${args[0]} ${args[2]}`)()),
    saveDayLog: vi.fn(call('log')),
    listDayLogs: vi.fn(async () => [] as unknown[]),
    getAnalyticsLayout: vi.fn(async () => ({ order: ['links', 'changes', 'cases', 'explains'], open: [] })),
    saveAnalyticsLayout: vi.fn(call('layout')),
  }
})
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

vi.mock('./mode', () => ({ isDemo: () => true }))
vi.mock('./demoRepo', () => ({ createDemoRepo: () => repo }))
vi.mock('./supabaseClient', () => ({ supabase: {} }))
vi.mock('./supabaseRepo', () => ({ createSupabaseRepo: () => ({}) }))

const {
  useAnalyticsLayout,
  useSaveAnalyticsLayout,
  useChallenges,
  useCloseDay,
  useCreateChallenge,
  useEntries,
  useReorderChallenges,
  useSetPaused,
  useStartDay,
  useUpdateChallenge,
} = await import('./queries')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('раскладка аналитики: отказ сети откатывает только своё (ревью Opus 25.09)', () => {
  const A = { order: ['links', 'changes', 'cases', 'explains'] as const, open: [] as string[] }
  const B = { order: [...A.order], open: ['links'] }
  const C = { order: [...A.order], open: ['links', 'changes'] }
  const hook = () =>
    renderHook(() => ({ layout: useAnalyticsLayout(), save: useSaveAnalyticsLayout() }), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>,
    })
  const layoutCalls = () => repo.pending.filter((p) => p.name === 'layout')
  /* очередь подделки общая: следующие тесты ждут в ней только свои записи */
  afterAll(() => {
    repo.pending.length = 0
  })

  it('одна запись упала — в кэше снова прежняя раскладка', async () => {
    repo.pending.length = 0
    const { result } = hook()
    await waitFor(() => expect(result.current.layout.data).toEqual(A))
    act(() => result.current.save.mutate(B as never))
    await waitFor(() => expect(layoutCalls()).toHaveLength(1))
    expect(result.current.layout.data).toEqual(B)
    act(() => layoutCalls()[0]!.reject({ code: 'x', message: 'сеть' }))
    await waitFor(() => expect(result.current.layout.data).toEqual(A))
  })

  it('первая из двух записей упала, вторая прошла — в кэше вторая, а не откат к первой', async () => {
    repo.pending.length = 0
    const { result } = hook()
    await waitFor(() => expect(result.current.layout.data).toEqual(A))
    act(() => {
      result.current.save.mutate(B as never)
      result.current.save.mutate(C as never)
    })
    await waitFor(() => expect(layoutCalls()).toHaveLength(1))
    act(() => layoutCalls()[0]!.reject({ code: 'x', message: 'сеть' }))
    await waitFor(() => expect(layoutCalls()).toHaveLength(2))
    act(() => layoutCalls()[1]!.resolve())
    await waitFor(() => expect(result.current.save.isPending).toBe(false))
    expect(result.current.layout.data).toEqual(C)
  })
})

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

describe('отметки «Ложусь раньше» — из утр, а не из хранилища (срез 4б)', () => {
  const bed = { id: 'bed', measure: 'bedtime', kind: 'do', goal: -30 }
  const night = (b: number) => ({ bed: b, wake: 460, bedHow: 'exact', wakeHow: 'exact' })

  it('у челленджа «Время» — отбой ночи после вечера дня; у остальных — то, что хранится', async () => {
    repo.listChallenges.mockImplementationOnce(async () => [bed, { id: 'read', measure: 'binary', kind: 'do', goal: 1 }] as never[])
    repo.listEntries.mockImplementationOnce(async () => ({ read: { '2026-09-22': 1 }, bed: { '2026-09-01': 1 } }))
    repo.listDayStarts.mockImplementationOnce(async () => [
      { day: '2026-09-23', morning: { sleep: 7, wellbeing: 6, mood: 6, night: night(-40) }, startedAt: '2026-09-23T08:00:00' },
      { day: '2026-09-24', morning: null, startedAt: '2026-09-24T12:00:00' },
    ])
    const { result } = renderHook(() => useEntries(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ read: { '2026-09-22': 1 }, bed: { '2026-09-22': -40, '2026-09-23': NaN } })
  })

  it('пока не пришли челленджи или утра — данных нет, а не отметки без «Ложусь раньше»', async () => {
    let release = () => {}
    repo.listDayStarts.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))))
    const { result } = renderHook(() => useEntries(), { wrapper })
    await waitFor(() => expect(repo.listEntries).toHaveBeenCalled())
    /* сами отметки уже пришли — а без утр отдавать их рано */
    await new Promise((r) => setTimeout(r, 30))
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
    act(() => release())
    await waitFor(() => expect(result.current.data).toEqual({}))
  })

  it('не загрузились утра — ошибка, а не пустые отметки', async () => {
    repo.listDayStarts.mockImplementationOnce(async () => {
      throw new Error('нет сети')
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useEntries(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe('закрытие дня с ответами отказов (срез 5а)', () => {
  const log = { day: '2026-09-24', mood: 6, wellbeing: 6, productivity: 6, tags: [], note: '', closedAt: '2026-09-24T20:00:00.000Z' }
  const setup = () => {
    repo.pending.length = 0
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['entries'], { smoke: { '2026-09-23': 1 } })
    client.setQueryData(['dayLogs'], [])
    const { result } = renderHook(() => useCloseDay(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    return { client, result }
  }

  it('ответы и итог видны сразу; в хранилище — сначала ответы, итог — последним', async () => {
    const { client, result } = setup()
    act(() => result.current.mutate({ log, answers: { smoke: 1, sugar: 0 } }))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    expect(client.getQueryData(['entries'])).toEqual({ smoke: { '2026-09-23': 1, '2026-09-24': 1 }, sugar: { '2026-09-24': 0 } })
    expect(client.getQueryData(['dayLogs'])).toEqual([log])

    expect(repo.pending.map((p) => p.name)).toEqual(['entry smoke 1'])
    act(() => repo.pending[0]!.resolve())
    await waitFor(() => expect(repo.pending.map((p) => p.name)).toEqual(['entry smoke 1', 'entry sugar 0']))
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(repo.pending.map((p) => p.name)).toEqual(['entry smoke 1', 'entry sugar 0', 'log']))
    expect(repo.setEntry).toHaveBeenCalledWith('smoke', '2026-09-24', 1)
    act(() => repo.pending[2]!.resolve())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('ответ не записался — итог не отправлен, оба кэша откатились: день не закрыт без ответа', async () => {
    const { client, result } = setup()
    act(() => result.current.mutate({ log, answers: { smoke: 1 } }))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    act(() => repo.pending[0]!.reject({ code: '23514', message: 'нет' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(repo.pending.map((p) => p.name)).toEqual(['entry smoke 1'])
    expect(client.getQueryData(['entries'])).toEqual({ smoke: { '2026-09-23': 1 } })
    expect(client.getQueryData(['dayLogs'])).toEqual([])
  })

  it('шедшее чтение отметок не затирает ответы, а после записи отметки перечитываются (ревью 5а)', async () => {
    repo.pending.length = 0
    let release: (v: unknown) => void = () => {}
    repo.listEntries.mockImplementationOnce(() => new Promise((r) => (release = r as (v: unknown) => void)))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['dayLogs'], [])
    const { result } = renderHook(
      () => ({ close: useCloseDay(), entries: useQuery({ queryKey: ['entries'], queryFn: () => repo.listEntries() }) }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    )
    await waitFor(() => expect(repo.listEntries).toHaveBeenCalled())
    const reads = repo.listEntries.mock.calls.length
    act(() => result.current.close.mutate({ log, answers: { smoke: 1 } }))
    await waitFor(() => expect(repo.pending).toHaveLength(1))
    /* старое чтение отвечает посреди записи — без отметки за день */
    await act(async () => release({ smoke: {} }))
    expect(client.getQueryData(['entries'])).toEqual({ smoke: { '2026-09-24': 1 } })

    act(() => repo.pending[0]!.resolve())
    await waitFor(() => expect(repo.pending).toHaveLength(2))
    act(() => repo.pending[1]!.resolve())
    await waitFor(() => expect(result.current.close.isSuccess).toBe(true))
    await waitFor(() => expect(repo.listEntries.mock.calls.length).toBeGreaterThan(reads))
  })
})
