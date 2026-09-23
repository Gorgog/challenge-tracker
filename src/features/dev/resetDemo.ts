import { SCENARIO_KEY, type DemoScenario } from '@/data/demoRepo'
import { MODE_KEY } from '@/data/mode'

/**
 * Чистит хранилище, чтобы начать проверку с нуля.
 *
 * Ключи Supabase (`sb-…`) не трогаем: в них лежит сессия, и полный `clear()`
 * выкидывал бы из аккаунта, а письмо с новой ссылкой на вход лимитировано. Режим «Демо» тоже
 * остаётся: сброс демо не должен выкидывать в базу.
 */
export function resetDemoData(storage: Storage, scenario?: DemoScenario): string[] {
  const removed: string[] = []

  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i)
    if (!key || key.startsWith('sb-') || key === MODE_KEY) continue
    storage.removeItem(key)
    removed.push(key)
  }

  /* Выбор истории пишется после чистки — после перезагрузки насыплется она. */
  if (scenario) storage.setItem(SCENARIO_KEY, scenario)
  return removed
}
