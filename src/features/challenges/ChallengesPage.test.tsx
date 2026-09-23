import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { ChallengesPage } from './ChallengesPage'

const mocked = vi.hoisted(() => ({
  purge: vi.fn(),
  failed: false,
  list: [] as Challenge[],
  idle: () => ({ mutate: () => {}, mutateAsync: async () => {} }),
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () =>
    mocked.failed ? { data: undefined, isPending: false, isError: true } : { data: mocked.list, isPending: false, isError: false },
  useTags: () => ({ data: [], isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: [], isPending: false }),
  useCreateChallenge: mocked.idle,
  useSetPaused: mocked.idle,
  useDeleteChallenge: mocked.idle,
  useRestoreChallenge: mocked.idle,
  usePurgeChallenge: () => ({ mutateAsync: mocked.purge }),
  useCreateTag: mocked.idle,
  useDeleteTag: mocked.idle,
  useUpdateChallenge: mocked.idle,
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const gone: Challenge = {
  id: 'gone',
  name: 'Читать',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: '2026-09-01',
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: '2026-09-20T10:00:00.000Z',
  sortOrder: 0,
}

beforeEach(() => {
  mocked.list = [gone]
  mocked.failed = false
  mocked.purge.mockReset()
  vi.mocked(toast).mockReset()
})

describe('экран челленджей — тост по факту', () => {
  it('«удалён навсегда» — у каждого удаления, когда база его приняла', async () => {
    const other: Challenge = { ...gone, id: 'other', name: 'Бегать' }
    mocked.list = [gone, other]
    const answers: { resolve: () => void; reject: (e: unknown) => void }[] = []
    mocked.purge.mockImplementation(() => new Promise<void>((resolve, reject) => answers.push({ resolve, reject })))
    const user = userEvent.setup()
    render(<ChallengesPage />)
    await user.click(screen.getByRole('button', { name: /Удалённые/ }))
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getAllByRole('button', { name: 'Удалить навсегда' })[0]!)
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' }))
    }
    expect(mocked.purge).toHaveBeenCalledTimes(2)
    expect(toast).not.toHaveBeenCalled()

    await act(async () => answers[0]!.resolve())
    await act(async () => answers[1]!.resolve())
    expect(toast).toHaveBeenCalledWith('«Читать» удалён навсегда')
    expect(toast).toHaveBeenCalledWith('«Бегать» удалён навсегда')
  })

  it('не загрузилось — так и сказано, а не «Челленджей пока нет»', () => {
    mocked.failed = true
    render(<ChallengesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить')
    expect(screen.queryByText(/Челленджей пока нет/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Новый челлендж/ })).toBeNull()
  })
})
