import { SCENARIO_KEY, type DemoScenario } from '@/data/demoRepo'

/**
 * Чистит хранилище, чтобы начать проверку с нуля.
 *
 * Ключи Supabase (`sb-…`) не трогаем: в них лежит сессия, и полный `clear()`
 * выкидывал бы из аккаунта, а письмо с новой ссылкой на вход лимитировано.
 */
export function resetDemoData(storage: Storage, scenario?: DemoScenario): string[] {
  const removed: string[] = []

  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i)
    if (!key || key.startsWith('sb-')) continue
    storage.removeItem(key)
    removed.push(key)
  }

  /* Выбор истории пишется после чистки — после перезагрузки насыплется она. */
  if (scenario) storage.setItem(SCENARIO_KEY, scenario)
  return removed
}
