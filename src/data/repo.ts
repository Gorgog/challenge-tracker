import type { ChallengePatch } from '@/domain/challenges'
import type { Challenge, DayGroup, DayLog, EntryMap, Tag } from '@/domain/types'

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
  /** Правка с учётом замка правил — см. `applyPatch`. */
  updateChallenge(id: string, patch: ChallengePatch): Promise<void>
  /**
   * Пауза и снятие паузы в день `today` — см. `pause` и `resume`: пауза хранится
   * периодом, чтобы её дни не считались пропусками.
   */
  setPaused(id: string, paused: boolean, today: string): Promise<void>
  /** Мягко: челлендж пропадает с глаз, а отметки и место в статистике остаются. */
  deleteChallenge(id: string): Promise<void>
  /** Возврат из корзины в день `today`: дни, пока челлендж был удалён, становятся паузой. */
  restoreChallenge(id: string, today: string): Promise<void>
  /** Навсегда: челлендж и все его отметки. Вернуть нельзя. */
  purgeChallenge(id: string): Promise<void>
  listTags(): Promise<Tag[]>
  /** Бросает, если имя пустое или такой тег уже есть — без учёта регистра и пробелов. */
  createTag(name: string): Promise<Tag>
  /** Удаляет тег и снимает его со всех челленджей. */
  deleteTag(id: string): Promise<void>
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
