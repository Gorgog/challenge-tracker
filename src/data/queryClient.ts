import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/*
 * Поколение кэша: растёт при каждой очистке (выход, смена пользователя). Откат упавшей записи сверяет
 * поколение с тем, что было при её начале, — иначе снимок прошлого пользователя вернулся бы в кэш нового.
 */
const generations = new WeakMap<QueryClient, number>()
export const generation = (client: QueryClient) => generations.get(client) ?? 0

/** Очистить кэш и начать новое поколение — при выходе и смене пользователя. */
export function resetCache(client: QueryClient) {
  generations.set(client, generation(client) + 1)
  client.clear()
}

/** Текст ошибки: postgrest-js отдаёт её простым объектом `{ code, message }`, а не `Error`. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'неизвестная ошибка'
}

/**
 * Клиент запросов сайта. Ошибка записи не молчит: база отвергает то, что пропускало демо, а сеть
 * пропадает, — оптимистичная правка откатывается, и об этом нужно сказать. Экран, который показывает
 * ошибку сам, помечает мутацию `meta: { ownError: true }`; своя подпись вместо «Не сохранилось» —
 * `meta: { errorText }` (её видно, даже если со страницы уже ушли).
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
    mutationCache: new MutationCache({
      onError(error, _variables, _context, mutation) {
        if (mutation.meta?.ownError) return
        const label = typeof mutation.meta?.errorText === 'string' ? mutation.meta.errorText : 'Не сохранилось'
        toast.error(`${label}: ${errorText(error)}. Изменение отменено.`)
      },
    }),
  })
}
