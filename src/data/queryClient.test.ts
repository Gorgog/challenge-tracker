import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './queryClient'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

beforeEach(() => vi.mocked(toast.error).mockReset())

async function failWith(message: string, meta?: Record<string, unknown>) {
  const client = createQueryClient()
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => {
      throw new Error(message)
    },
    meta,
  })
  await mutation.execute(undefined).catch(() => {})
}

describe('ошибки записи не молчат', () => {
  it('база отказала — общий тост с причиной и что изменение не сохранилось', async () => {
    await failWith('new row violates check constraint')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toMatch(/Не сохранилось.*new row violates check constraint/)
  })

  it('экран показывает ошибку сам (meta.ownError) — общего тоста нет', async () => {
    await failWith('День уже начат', { ownError: true })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
