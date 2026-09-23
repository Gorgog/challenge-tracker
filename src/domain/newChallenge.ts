import type { Challenge, ChallengeDraft } from './types'

/** Шесть цветов серий из темы. Больше шести — начинаем по кругу. */
const PALETTE = Array.from({ length: 6 }, (_, i) => `var(--chart-${i + 1})`)

/**
 * Короткий код челленджа: он опознаёт челлендж в сетках и списках там,
 * где цвет один не спасает — например при дальтонизме.
 */
export function suggestCode(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((w) => /\p{L}{2,}/u.test(w))
  if (!words.length) return ''
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0]!)
    .join('')
    .toUpperCase()
}

/**
 * Код из названия — никогда не пустой: у «100» или «5×5» нет слов для `suggestCode`, а база пустой код
 * не примет. Тогда — первые три знака без пробелов (по символам, эмодзи не режутся пополам).
 */
export function codeFor(name: string): string {
  return suggestCode(name) || Array.from(name.replace(/\s+/g, '')).slice(0, 3).join('').toUpperCase()
}

/** Первый свободный цвет: два челленджа одного цвета в списке неразличимы. */
export function pickColor(existing: Challenge[]): string {
  const used = new Set(existing.map((c) => c.color))
  return PALETTE.find((color) => !used.has(color)) ?? PALETTE[0]!
}

/**
 * Собирает челлендж из заполненной формы.
 * Отказ всегда галочка: «сорвался» — это да или нет, считать там нечего.
 */
export function buildChallenge(
  draft: ChallengeDraft,
  existing: Challenge[],
  today: string,
): Omit<Challenge, 'id'> {
  const counted = draft.kind === 'do' && draft.measure === 'count'

  return {
    name: draft.name.trim(),
    code: (draft.code.trim() || codeFor(draft.name)).toUpperCase(),
    kind: draft.kind,
    measure: counted ? 'count' : 'binary',
    goal: counted ? draft.goal : 1,
    unit: counted ? draft.unit.trim() || null : null,
    color: pickColor(existing),
    tagIds: [...draft.tagIds],
    startDate: today,
    lengthDays: draft.lengthDays,
    pauses: [],
    rulesLocked: draft.rulesLocked,
    deletedAt: null,
    sortOrder: existing.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1,
  }
}
