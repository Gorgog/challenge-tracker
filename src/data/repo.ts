import type { Challenge, DayGroup, DayLog, EntryMap } from '@/domain/types'

/**
 * Договор доступа к данным. Компоненты не знают, что за ним стоит: сейчас демо-данные
 * в памяти, позже Supabase. Меняется реализация — экраны не трогаются.
 */
export type Repo = {
  listChallenges(): Promise<Challenge[]>
  /** Отметки всех челленджей: id челленджа → отметки по дням. */
  listEntries(): Promise<Record<string, EntryMap>>
  listDayLogs(): Promise<DayLog[]>
  /** Заводит челлендж и возвращает его уже с выданным id. */
  createChallenge(challenge: Omit<Challenge, 'id'>): Promise<Challenge>
  /**
   * Поставить или снять отметку. `undefined` УДАЛЯЕТ запись, а не пишет ноль:
   * «не отмечено» и «ноль» — разные состояния (см. CLAUDE.md).
   */
  setEntry(challengeId: string, day: string, value: number | undefined): Promise<void>
  /** Сохранить итог дня. Запись за день одна: повторный вызов перезаписывает её. */
  saveDayLog(log: DayLog): Promise<void>
  /**
   * Выстроить челленджи в заданном порядке. Не упомянутые остаются в хвосте
   * в прежнем порядке — список не должен терять челленджи из-за неполного вызова.
   */
  reorderChallenges(orderedIds: string[]): Promise<void>
  /** Порядок блоков на экране дня. */
  getDayGroups(): Promise<DayGroup[]>
  saveDayGroups(groups: DayGroup[]): Promise<void>
}
