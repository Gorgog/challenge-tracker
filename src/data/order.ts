/**
 * Новый порядок челленджей: сначала заданные id (неизвестные пропускаются), затем не упомянутые — в
 * прежнем порядке. Неполный список не теряет челленджи. Общее для всех хранилищ.
 */
export function orderAfter(challenges: { id: string; sortOrder: number }[], orderedIds: string[]): string[] {
  const known = new Set(challenges.map((c) => c.id))
  const first = orderedIds.filter((id, i) => known.has(id) && orderedIds.indexOf(id) === i)
  const rest = challenges
    .filter((c) => !first.includes(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.id)
  return [...first, ...rest]
}
