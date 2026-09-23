/**
 * Адрес сайта с его путём: на GitHub Pages сайт живёт в `/challenge-tracker/`, и ссылка входа из письма
 * должна вести туда, а не в корень домена.
 */
export const siteUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href
