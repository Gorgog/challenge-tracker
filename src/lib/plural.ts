/**
 * Русская плюрализация: `plural(2, 'день', 'дня', 'дней')` → `дня`.
 * Формы — для 1, для 2–4 и для 5–20.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const hundred = Math.abs(n) % 100
  const ten = n % 10
  if (hundred >= 11 && hundred <= 14) return many
  if (ten === 1) return one
  if (ten >= 2 && ten <= 4) return few
  return many
}
