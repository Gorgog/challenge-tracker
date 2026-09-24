import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay, todayKey } from '@/domain/date'
import type { Challenge, DayStart } from '@/domain/types'
import { MemoryRouter } from 'react-router'
import { ChallengesPage } from './ChallengesPage'

const mocked = vi.hoisted(() => ({
  /*
   * Как useMutation в TanStack v5: у mutate колбэки срабатывают только у последнего вызова, у mutateAsync
   * — у каждого свой промис. Ответы отдаёт тест.
   */
  purgeHook: (() => {
    const answers: { resolve: () => void; reject: (e: unknown) => void }[] = []
    let last: unknown = null
    const run = () => new Promise<void>((resolve, reject) => answers.push({ resolve, reject }))
    return {
      answers,
      mutate: (_id: string, callbacks?: { onSuccess?: () => void }) => {
        last = callbacks
        run().then(() => {
          if (last === callbacks) callbacks?.onSuccess?.()
        }, () => {})
      },
      mutateAsync: (_id: string) => run(),
    }
  })(),
  purge: vi.fn(),
  failed: false,
  list: [] as Challenge[],
  starts: [] as DayStart[],
  idle: () => ({ mutate: () => {}, mutateAsync: async () => {} }),
}))

vi.mock('@/data/queries', () => ({
  useChallenges: () =>
    mocked.failed ? { data: undefined, isPending: false, isError: true } : { data: mocked.list, isPending: false, isError: false },
  useTags: () => ({ data: [], isPending: false }),
  useEntries: () => ({ data: {}, isPending: false }),
  useDayLogs: () => ({ data: [], isPending: false }),
  useDayStarts: () => ({ data: mocked.starts, isPending: false }),
  useCreateChallenge: mocked.idle,
  useSetPaused: mocked.idle,
  useDeleteChallenge: mocked.idle,
  useRestoreChallenge: mocked.idle,
  usePurgeChallenge: () => mocked.purgeHook,
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
    const answers = mocked.purgeHook.answers
    answers.length = 0
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ChallengesPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /Удалённые/ }))
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getAllByRole('button', { name: 'Удалить навсегда' })[i]!)
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' }))
    }
    expect(answers).toHaveLength(2)
    expect(toast).not.toHaveBeenCalled()

    await act(async () => answers[0]!.resolve())
    await act(async () => answers[1]!.resolve())
    expect(toast).toHaveBeenCalledWith('«Читать» удалён навсегда')
    expect(toast).toHaveBeenCalledWith('«Бегать» удалён навсегда')
  })

  it('не загрузилось — так и сказано, а не «Челленджей пока нет»', () => {
    mocked.failed = true
    render(
      <MemoryRouter>
        <ChallengesPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить')
    expect(screen.queryByText(/Челленджей пока нет/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Новый челлендж/ })).toBeNull()
  })
})

describe('«Попробовать: ложусь раньше» из аналитики (срез 4б)', () => {
  const night = { bed: 0, wake: 460, bedHow: 'exact' as const, wakeHow: 'exact' as const }
  it('форма открыта с черновиком: «Ложусь раньше», «Время», обычный отбой на 30 минут раньше', async () => {
    mocked.list = []
    /* три ночи до сегодня — от настоящих часов: страница берёт «сегодня» сама */
    mocked.starts = [4, 3, 2].map((back) => dayKey(addDays(parseDay(todayKey()), -back))).map((day) => ({
      day,
      morning: { sleep: 7, wellbeing: 6, mood: 6, night },
      startedAt: `${day}T08:00:00`,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/challenges', state: { draft: 'bedtime' } }]}>
        <ChallengesPage />
      </MemoryRouter>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый челлендж' })
    expect(within(dialog).getByLabelText(/название/i)).toHaveValue('Ложусь раньше')
    expect(within(dialog).getByRole('button', { name: 'Время' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText('Лечь не позже')).toHaveValue('23:30')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // черновик отработал: следующий «Новый челлендж» — пустая форма (ревью 4б)
    await user.click(screen.getByRole('button', { name: /Новый челлендж/ }))
    const next = screen.getByRole('dialog', { name: 'Новый челлендж' })
    expect(within(next).getByLabelText(/название/i)).toHaveValue('')
    expect(within(next).getByRole('button', { name: 'Время' })).toHaveAttribute('aria-pressed', 'false')
  })
})
