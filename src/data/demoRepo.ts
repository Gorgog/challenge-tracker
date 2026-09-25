import { normalizeLayout, type AnalyticsLayout } from '@/domain/analyticsLayout'
import { parseDay, todayKey } from '@/domain/date'
import { applyPatch, pause, restore, resume } from '@/domain/challenges'
import { validBedtimeGoal } from '@/domain/bedtime'
import { validNight } from '@/domain/night'
import { validLevels } from '@/domain/tags'
import {
  DEFAULT_DAY_GROUPS,
  DEFAULT_SETTINGS,
  type Challenge,
  type DayGroup,
  type DayLog,
  type DayStart,
  type EntryMap,
  type Morning,
  type Settings,
  type Tag,
} from '@/domain/types'
import { orderAfter } from './order'
import type { Repo } from './repo'
import { seedBurnout } from './seeds/burnout'
import { seedFull } from './seeds/full'


/** Какую историю насыпать: полное демо на 120 дней или «выход из выгорания» на 30. */
export type DemoScenario = 'full' | 'burnout'

export type DemoOptions = {
  /** `empty` — пустое хранилище для договора хранилища (`repoContract`), в кнопке сброса его нет. */
  scenario?: DemoScenario | 'empty'
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
const STORAGE_VERSION = 14

/** Копия утра с ночью; утро без ночи — ночь null, как читает база. */
const copyMorning = (m: Morning | null): Morning | null => (m ? { ...m, night: m.night ? { ...m.night } : null } : null)

/** Копия итога дня; ступени — полем только непустые, как читает база (срез 5б). */
const copyLog = ({ levels, ...log }: DayLog): DayLog => ({
  ...log,
  tags: [...log.tags],
  ...(levels && Object.keys(levels).length > 0 ? { levels: { ...levels } } : {}),
})

type Snapshot = {
  version: number
  challenges: Challenge[]
  entries: Record<string, EntryMap>
  /** Ступени тегов (`levels`) и новые теги в сиде — с версии 14. */
  logs: DayLog[]
  tags: Tag[]
  /** Может отсутствовать в снимках, сделанных до появления перетаскивания блоков. */
  dayGroups?: DayGroup[]
  /** Может отсутствовать в снимках до раскладки аналитики (25.09) — тогда по умолчанию. */
  analyticsLayout?: AnalyticsLayout
  /** Начала дней — с версии 7; с версии 8 в сиде нет сегодняшних отметок. */
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
function seedSnapshot(today: Date, seed: number, scenario: DemoScenario | 'empty'): Snapshot {
  const seedOf = scenario === 'burnout' ? seedBurnout : seedFull
  return {
    version: STORAGE_VERSION,
    ...(scenario === 'empty' ? { challenges: [], entries: {}, logs: [], starts: [], tags: [] } : seedOf(today, seed)),
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
  let analyticsLayout = normalizeLayout(state.analyticsLayout)
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
      analyticsLayout,
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
      return [...logs.values()].map(copyLog).sort((a, b) => a.day.localeCompare(b.day))
    },
    async createChallenge(draft) {
      /* то же правило, что держит база: «Время» — только у привычки, цель — целые минуты в границах ночи */
      if (draft.measure === 'bedtime' && (!validBedtimeGoal(draft.goal) || draft.kind !== 'do')) throw new Error('Время отбоя записано неверно')
      const created: Challenge = { ...draft, tagIds: [...draft.tagIds], id: `ch-${++lastId}` }
      challenges.push(created)
      entries[created.id] = {}
      persist()
      return { ...created }
    },
    async updateChallenge(id, patch) {
      const index = challenges.findIndex((c) => c.id === id)
      if (index < 0) return
      const next = applyPatch(challenges[index]!, patch, Object.keys(entries[id] ?? {}).length > 0)
      if (next.measure === 'bedtime' && (!validBedtimeGoal(next.goal) || next.kind !== 'do')) throw new Error('Время отбоя записано неверно')
      challenges[index] = next
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
      /* как в базе: у «Времени» отметок нет, выполнение считается из утра */
      if (find(challengeId)?.measure === 'bedtime') throw new Error('Отбой отмечается утром, а не отметкой')
      /* как в базе: у отказа отметка — только ответ дня, 1 «Да, без» или 0 «сорвался» (срез 5а) */
      if (find(challengeId)?.kind === 'quit' && value !== undefined && value !== 0 && value !== 1)
        throw new Error('У отказа отметка — только «Да, без» (1) или «сорвался» (0)')
      const map = (entries[challengeId] ??= {})
      if (value === undefined) delete map[day]
      else map[day] = value
      persist()
    },
    async saveDayLog(log) {
      /* те же правила, что держит база (day_logs_tag_levels): ступень — только у отмеченного тега с количеством */
      if (!validLevels(log.tags, log.levels)) throw new Error(`Ступени тегов ${log.day} записаны неверно`)
      logs.set(log.day, copyLog(log))
      persist()
    },
    async listDayStarts() {
      return [...starts.values()]
        .map((s) => ({ ...s, morning: copyMorning(s.morning) }))
        .sort((a, b) => a.day.localeCompare(b.day))
    },
    async startDay(start) {
      if (starts.has(start.day)) throw new Error(`День ${start.day} уже начат: утро не правится`)
      /* те же правила, что держит база (day_starts_night_*) */
      const night = start.morning?.night
      if (night && !validNight(night)) throw new Error(`Ночь ${start.day} записана неверно: отбой должен быть раньше подъёма`)
      starts.set(start.day, { ...start, morning: copyMorning(start.morning) })
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
      const order = orderAfter(challenges, orderedIds)
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
    async getAnalyticsLayout() {
      return { order: [...analyticsLayout.order], open: [...analyticsLayout.open] }
    },
    async saveAnalyticsLayout(layout) {
      analyticsLayout = normalizeLayout(layout)
      persist()
    },
  }
}
