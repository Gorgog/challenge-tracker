import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge } from '@/domain/types'
import { ChallengesPage } from './ChallengesPage'

const mocked = vi.hoisted(() => ({
  purge: vi.fn(),
  list: [] as Challenge[],
  idle: () => ({ mutate: () => {}, mutateAsync: async () => {} }),
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () => ({ data: mocked.list, isPending: false }),
  useTags: () => ({ data: [], isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: [], isPending: false }),
  useCreateChallenge: mocked.idle,
  useSetPaused: mocked.idle,
  useDeleteChallenge: mocked.idle,
  useRestoreChallenge: mocked.idle,
  usePurgeChallenge: () => ({ mutate: mocked.purge }),
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
  mocked.purge.mockReset()
  vi.mocked(toast).mockReset()
})

describe('экран челленджей — тост по факту', () => {
  it('«удалён навсегда» — только когда база приняла удаление', async () => {
    const user = userEvent.setup()
    render(<ChallengesPage />)
    await user.click(screen.getByRole('button', { name: /Удалённые/ }))
    await user.click(screen.getByRole('button', { name: 'Удалить навсегда' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' }))

    expect(mocked.purge).toHaveBeenCalledWith('gone', expect.anything())
    expect(toast).not.toHaveBeenCalled()
    mocked.purge.mock.calls[0]![1].onSuccess()
    expect(toast).toHaveBeenCalledWith('«Читать» удалён навсегда')
  })
})
