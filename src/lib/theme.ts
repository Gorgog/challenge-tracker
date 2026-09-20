/**
 * Тема следует за системной настройкой: класс `dark` на <html> — то, на чём завязаны
 * токены shadcn. Отдельного переключателя пока нет, он появится вместе с настройками.
 */
export function startThemeSync() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (dark: boolean) => document.documentElement.classList.toggle('dark', dark)
  apply(media.matches)
  media.addEventListener('change', (e) => apply(e.matches))
}
