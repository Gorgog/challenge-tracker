/**
 * Режим сайта: база (по умолчанию) или демо — выдуманные истории в браузере, база не трогается.
 * Выбор живёт в этом браузере; переключение перезагружает страницу, и `queries.ts` берёт нужное
 * хранилище.
 */
export const MODE_KEY = 'tabel-mode'

/** Обращение к localStorage бросает в приватном окне и при запрете хранилища для сайта. */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function isDemo(storage: Storage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(MODE_KEY) === 'demo'
  } catch {
    return false
  }
}

export function setDemo(on: boolean, storage: Storage | null = defaultStorage()) {
  try {
    if (on) storage?.setItem(MODE_KEY, 'demo')
    else storage?.removeItem(MODE_KEY)
  } catch {
    /* запись запрещена — остаёмся в базе */
  }
}
