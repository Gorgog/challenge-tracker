import { parseDay, todayKey } from '@/domain/date'
import { applyPatch, pause, restore, resume } from '@/domain/challenges'
import {
  DEFAULT_DAY_GROUPS,
  DEFAULT_SETTINGS,
  type Challenge,
  type DayGroup,
  type DayLog,
  type DayStart,
  type EntryMap,
  type Settings,
  type Tag,
} from '@/domain/types'
import type { Repo } from './repo'
import { seedBurnout } from './seeds/burnout'
import { seedFull } from './seeds/full'


/** Какую историю насыпать: полное демо на 120 дней или «выход из выгорания» на 30. */
export type DemoScenario = 'full' | 'burnout'

export type DemoOptions = {
  scenario?: DemoScenario
  /** «Сегодня» для сида. По умолчанию — реальная текущая дата. */
  today?: Date
  seed?: number
  /** Где держать демо-данные между перезагрузками. `null` — нигде, только в памяти. */
  storage?: Storage | null
}

const STORAGE_KEY = 'tabel-demo'
/** Какую историю насыпать при следующем сбросе — выбор переживает и сброс, и перезагрузку. */
export const SCENARIO_KEY = 'tabel-demo-scenario'
/** Растёт, когда меняется форма снимка: старый снимок тогда просто пересобирается. */
const STORAGE_VERSION = 7

type Snapshot = {
  version: number
  challenges: Challenge[]
  entries: Record<string, EntryMap>
  logs: DayLog[]
  tags: Tag[]
  /** Может отсутствовать в снимках, сделанных до появления перетаскивания блоков. */
  dayGroups?: DayGroup[]
  /** Начала дней — с версии 7. */
  starts: DayStart[]
  settings: Settings
}

/** Обращение к localStorage бросает в приватном окне и при запрете хранилища для сайта. */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function load(storage: Storage | null): Snapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Snapshot
    const valid =
      parsed?.version === STORAGE_VERSION &&
      Array.isArray(parsed.challenges) &&
      Array.isArray(parsed.logs) &&
      Array.isArray(parsed.tags) &&
      Array.isArray(parsed.starts) &&
      typeof parsed.settings?.morningUntil === 'number' &&
      !!parsed.entries &&
      typeof parsed.entries === 'object'
    return valid ? parsed : null
  } catch {
    /* битый json или недоступное хранилище — начнём с чистого сида */
    return null
  }
}

function save(storage: Storage | null, snapshot: Snapshot) {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* места нет или запись запрещена — демо продолжает жить в памяти */
  }
}

function readScenario(storage: Storage | null): DemoScenario | null {
  try {
    const value = storage?.getItem(SCENARIO_KEY)
    return value === 'full' || value === 'burnout' ? value : null
  } catch {
    return null
  }
}

/** Какая история выбрана — для кнопки сброса. Без выбора — полное демо. */
export function demoScenario(storage: Storage | null = defaultStorage()): DemoScenario {
  return readScenario(storage) ?? 'full'
}

/** Насыпает снимок выбранного сценария. */
function seedSnapshot(today: Date, seed: number, scenario: DemoScenario): Snapshot {
  const seedOf = scenario === 'burnout' ? seedBurnout : seedFull
  return {
    version: STORAGE_VERSION,
    starts: [],
    ...seedOf(today, seed),
    dayGroups: [...DEFAULT_DAY_GROUPS],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * Демо-репозиторий. Нужен, чтобы переносить и править интерфейс на живых данных,
 * пока схема в Supabase не готова. Состояние переживает перезагрузку через localStorage;
 * при переезде на настоящее хранилище этот файл просто удаляется.
 */
export function createDemoRepo(options: DemoOptions = {}): Repo {
  const today = options.today ?? parseDay(todayKey())
  const storage = options.storage === undefined ? defaultStorage() : options.storage

  const restored = load(storage)
  const scenario = options.scenario ?? readScenario(storage) ?? 'full'
  const state = restored ?? seedSnapshot(today, options.seed ?? 20260921, scenario)

  const challenges = state.challenges
  const entries = state.entries
  const logs = new Map(state.logs.map((l) => [l.day, l]))
  const tags = state.tags
  let dayGroups: DayGroup[] = state.dayGroups ?? [...DEFAULT_DAY_GROUPS]
  const starts = new Map(state.starts.map((s) => [s.day, s]))
  let settings: Settings = { ...state.settings }

  /* Нумерация продолжается после перезагрузки, иначе новый челлендж займёт чужой id. */
  const lastNumber = (ids: string[], prefix: string) =>
    ids.reduce((max, id) => {
      const n = Number(new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1])
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)

  let lastId = lastNumber(challenges.map((c) => c.id), 'ch')
  let lastTagId = lastNumber(tags.map((t) => t.id), 'tag')

  const find = (id: string) => challenges.find((c) => c.id === id)
  const sameName = (a: string, b: string) =>
    a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru')

  const persist = () =>
    save(storage, {
      version: STORAGE_VERSION,
      challenges,
      entries,
      logs: [...logs.values()],
      tags,
      dayGroups,
      starts: [...starts.values()],
      settings,
    })

  if (!restored) persist()

  /* Наружу отдаём копии: кэш запросов не должен делить объекты с хранилищем. */
  const snapshotEntries = () =>
    Object.fromEntries(Object.entries(entries).map(([id, map]) => [id, { ...map }]))

  return {
    async listChallenges() {
      return [...challenges]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ ...c, tagIds: [...c.tagIds], pauses: c.pauses.map((p) => ({ ...p })) }))
    },
    async listEntries() {
      return snapshotEntries()
    },
    async listDayLogs() {
      return [...logs.values()]
        .map((l) => ({ ...l, tags: [...l.tags] }))
        .sort((a, b) => a.day.localeCompare(b.day))
    },
    async createChallenge(draft) {
      const created: Challenge = { ...draft, tagIds: [...draft.tagIds], id: `ch-${++lastId}` }
      challenges.push(created)
      entries[created.id] = {}
      persist()
      return { ...created }
    },
    async updateChallenge(id, patch) {
      const index = challenges.findIndex((c) => c.id === id)
      if (index < 0) return
      challenges[index] = applyPatch(challenges[index]!, patch)
      persist()
    },
    async setPaused(id, paused, today) {
      const index = challenges.findIndex((c) => c.id === id)
      if (index < 0) return
      const day = parseDay(today)
      const c = challenges[index]!
      const closed = Boolean(logs.get(today)?.closedAt)
      challenges[index] = paused ? pause(c, entries[id] ?? {}, day, closed) : resume(c, day, closed)
      persist()
    },
    async deleteChallenge(id) {
      const c = find(id)
      if (!c) return
      /* Отметки не трогаем: удалённый челлендж по-прежнему участвует в статистике. */
      c.deletedAt = new Date().toISOString()
      persist()
    },
    async restoreChallenge(id, today) {
      const index = challenges.findIndex((c) => c.id === id)
      if (index < 0) return
      const closed = Boolean(logs.get(today)?.closedAt)
      challenges[index] = restore(challenges[index]!, parseDay(today), closed)
      persist()
    },
    async purgeChallenge(id) {
      const index = challenges.findIndex((c) => c.id === id)
      if (index >= 0) challenges.splice(index, 1)
      delete entries[id]
      persist()
    },
    async listTags() {
      return tags.map((t) => ({ ...t })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    },
    async createTag(name) {
      const clean = name.trim()
      if (!clean) throw new Error('Имя тега не может быть пустым')
      if (tags.some((t) => sameName(t.name, clean))) throw new Error(`Тег «${clean}» уже есть`)
      const tag = { id: `tag-${++lastTagId}`, name: clean }
      tags.push(tag)
      persist()
      return { ...tag }
    },
    async deleteTag(id) {
      const index = tags.findIndex((t) => t.id === id)
      if (index >= 0) tags.splice(index, 1)
      for (const c of challenges) c.tagIds = c.tagIds.filter((t) => t !== id)
      persist()
    },
    async setEntry(challengeId, day, value) {
      const map = (entries[challengeId] ??= {})
      if (value === undefined) delete map[day]
      else map[day] = value
      persist()
    },
    async saveDayLog(log) {
      logs.set(log.day, { ...log, tags: [...log.tags] })
      persist()
    },
    async listDayStarts() {
      return [...starts.values()]
        .map((s) => ({ ...s, morning: s.morning ? { ...s.morning } : null }))
        .sort((a, b) => a.day.localeCompare(b.day))
    },
    async startDay(start) {
      if (starts.has(start.day)) throw new Error(`День ${start.day} уже начат: утро не правится`)
      starts.set(start.day, { ...start, morning: start.morning ? { ...start.morning } : null })
      persist()
    },
    async getSettings() {
      return { ...settings }
    },
    async saveSettings(next) {
      settings = { ...next }
      persist()
    },
    async reorderChallenges(orderedIds) {
      /* Не упомянутые идут следом, сохраняя прежний относительный порядок. */
      const rest = challenges
        .filter((c) => !orderedIds.includes(c.id))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.id)

      const order = [...orderedIds.filter((id) => challenges.some((c) => c.id === id)), ...rest]
      for (const c of challenges) c.sortOrder = order.indexOf(c.id)
      persist()
    },
    async getDayGroups() {
      return [...dayGroups]
    },
    async saveDayGroups(groups) {
      dayGroups = [...groups]
      persist()
    },
  }
}
