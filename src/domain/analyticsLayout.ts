/**
 * Раскладка экрана аналитики (решение Georgy 25.09): порядок блоков разбора и какие из них открыты. График и фраза
 * не двигаются и не сворачиваются. Хранится в аккаунте (`user_settings`), чтобы на компьютере и телефоне было одинаково.
 * Новый блок — сюда, в конец, и в проверку колонок `analytics_order` / `analytics_open` в базе.
 */
export const ANALYTICS_BLOCKS = ['links', 'changes', 'cases', 'explains'] as const
export type AnalyticsBlock = (typeof ANALYTICS_BLOCKS)[number]
export type AnalyticsLayout = { order: AnalyticsBlock[]; open: AnalyticsBlock[] }

export const DEFAULT_ANALYTICS_LAYOUT: AnalyticsLayout = { order: [...ANALYTICS_BLOCKS], open: [] }

const known = (list: unknown): AnalyticsBlock[] =>
  Array.isArray(list) ? [...new Set(list.filter((b): b is AnalyticsBlock => ANALYTICS_BLOCKS.includes(b as AnalyticsBlock)))] : []

/** Чужое и повторы — прочь, забытые блоки (в том числе новые) — в хвост в обычном порядке. */
export function normalizeLayout(raw: Partial<AnalyticsLayout> | null | undefined): AnalyticsLayout {
  const order = known(raw?.order)
  return { order: [...order, ...ANALYTICS_BLOCKS.filter((b) => !order.includes(b))], open: known(raw?.open) }
}

/** Блок встаёт на место того, на который его бросили; скрытые сейчас блоки остаются на своих местах в списке. */
export function moveBlock(order: AnalyticsBlock[], active: AnalyticsBlock, over: AnalyticsBlock): AnalyticsBlock[] {
  const from = order.indexOf(active)
  const to = order.indexOf(over)
  if (from < 0 || to < 0 || from === to) return order
  const next = order.filter((b) => b !== active)
  next.splice(to, 0, active)
  return next
}

export function toggleOpen(layout: AnalyticsLayout, block: AnalyticsBlock): AnalyticsLayout {
  const open = layout.open.includes(block) ? layout.open.filter((b) => b !== block) : [...layout.open, block]
  return { ...layout, open }
}
