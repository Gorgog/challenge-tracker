import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Клиент запросов сайта. Ошибка записи не молчит: база отвергает то, что пропускало демо, а сеть
 * пропадает, — оптимистичная правка откатывается, и об этом нужно сказать. Экран, который показывает
 * ошибку сам, помечает мутацию `meta: { ownError: true }`.
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
        const reason = error instanceof Error ? error.message : String(error)
        toast.error(`Не сохранилось: ${reason}. Изменение отменено.`)
      },
    }),
  })
}
