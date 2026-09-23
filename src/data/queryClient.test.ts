import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './queryClient'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

beforeEach(() => vi.mocked(toast.error).mockReset())

async function failWith(message: string, meta?: Record<string, unknown>, asObject = false) {
  const client = createQueryClient()
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => {
      /* postgrest-js отдаёт ошибку простым объектом { code, message, details, hint }, а не Error */
      throw asObject ? { code: '23514', message, details: null, hint: null } : new Error(message)
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

  it('ошибка базы простым объектом — в тосте её текст, а не «[object Object]»', async () => {
    await failWith('new row violates check constraint "challenges_code_check"', undefined, true)
    const text = vi.mocked(toast.error).mock.calls[0]![0] as string
    expect(text).toContain('challenges_code_check')
    expect(text).not.toContain('[object Object]')
  })

  it('своя подпись ошибки (meta.errorText) — вместо «Не сохранилось»', async () => {
    await failWith('День уже начат', { errorText: 'Не получилось начать день' })
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Не получилось начать день: День уже начат/))
  })

  it('экран показывает ошибку сам (meta.ownError) — общего тоста нет', async () => {
    await failWith('День уже начат', { ownError: true })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
