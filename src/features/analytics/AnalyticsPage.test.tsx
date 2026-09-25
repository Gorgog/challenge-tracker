import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import type { Challenge, DayLog, DayStart, EntryMap } from '@/domain/types'
import { AnalyticsPage } from './AnalyticsPage'

const TODAY = parseDay('2026-09-23')
const key = (back: number) => dayKey(addDays(TODAY, -back))

const mocked = vi.hoisted(() => ({
  challenges: [] as Challenge[],
  entries: {} as Record<string, EntryMap>,
  logs: [] as DayLog[],
  starts: [] as DayStart[],
  failed: null as null | 'challenges' | 'entries' | 'logs' | 'starts',
}))

vi.mock('@/data/queries', () => {
  const result = (name: typeof mocked.failed, data: unknown) =>
    mocked.failed === name ? { data: undefined, isPending: false, isError: true } : { data, isPending: false, isError: false }
  return {
    useSettings: () => ({ data: { morningUntil: 15 }, isPending: false, isError: false }),
    useChallenges: () => result('challenges', mocked.challenges),
    useEntries: () => result('entries', mocked.entries),
    useDayLogs: () => result('logs', mocked.logs),
    useDayStarts: () => result('starts', mocked.starts),
  }
})

const push: Challenge = {
  id: 'push',
  name: 'Отжиматься по 20 раз',
  code: 'ОТЖ',
  kind: 'do',
  measure: 'count',
  goal: 20,
  unit: 'раз',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(80),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

/**
 * 60 дней. Обычно: утро 6, вечер 7 или 8 через день (день 6,5 или 7), сон 7 — полоса «обычно» 6,5–7.
 * Последние 7 прошедших дней (7…1 назад) — плохие: утро 3, вечер 4, сон 2, вечером алкоголь.
 * Сегодня начат с утром 7 и сном 8, вечера нет.
 */
function world() {
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let back = 59; back >= 1; back--) {
    const bad = back <= 7
    const ev = bad ? 4 : back % 2 ? 7 : 8
    logs.push({ day: key(back), mood: ev, wellbeing: ev, productivity: 6, tags: bad ? ['алкоголь'] : [], note: '', closedAt: `${key(back)}T21:00:00.000Z` })
    starts.push({ day: key(back), morning: bad ? { sleep: 2, wellbeing: 3, mood: 3 } : { sleep: 7, wellbeing: 6, mood: 6 }, startedAt: `${key(back)}T08:00:00.000Z` })
  }
  starts.push({ day: key(0), morning: { sleep: 8, wellbeing: 7, mood: 7 }, startedAt: `${key(0)}T08:00:00.000Z` })
  return { logs, starts }
}

/** Страница как открыл: блоки разбора свёрнуты. */
const showFolded = () =>
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  )
/** Раскрыть все свёрнутые блоки разбора — как если бы нажал на каждый заголовок. */
const unfold = () => document.querySelectorAll<HTMLElement>('[data-fold][aria-expanded="false"]').forEach((b) => fireEvent.click(b))
/** Страница с раскрытыми блоками: тесты содержимого блоков. */
const show = () => {
  const r = showFolded()
  unfold()
  return r
}
const headline = () => screen.getByTestId('headline')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12, 0))
  Object.assign(mocked, { challenges: [push], entries: {}, failed: null, ...world() })
})
afterEach(() => vi.useRealTimers())

const quit: Challenge = { ...push, id: 'quit', code: 'БСГ', name: 'Без сигарет', kind: 'quit', measure: 'binary', goal: 1, sortOrder: 1 }
const gone: Challenge = { ...push, id: 'gone', code: 'УДЛ', name: 'Удалённый', deletedAt: `${key(40)}T10:00:00.000Z`, sortOrder: 2 }
const chart = () => screen.getByRole('region', { name: 'График' })
const dayButton = (name: RegExp) => within(chart()).getByRole('button', { name })

describe('AnalyticsPage — обзор: цель, фраза, график, «Что изменилось»', () => {
  it('сверху — фраза против своего обычного по полным дням; сегодняшнее утро без вечера — не в счёт', () => {
    show()
    expect(headline()).toHaveTextContent('Последние 2 недели — хуже обычного')
    expect(screen.getByText('7 дней из 13 полных — ниже твоего обычного')).toBeInTheDocument()
    expect(screen.getByText('Полоса — твоё обычное: 6,5–7,0 (по 28 полным дням за 4 недели до этих)')).toBeInTheDocument()
  })

  it('на графике — точка на полный день: 7 ниже полосы, сегодня — серая «только утро»', () => {
    show()
    expect(chart().querySelectorAll('[data-point="below"]')).toHaveLength(7)
    expect(chart().querySelectorAll('[data-point="partial"]')).toHaveLength(1)
    expect(within(chart()).getByText('утро')).toBeInTheDocument()
  })

  it('цель «Сон» перестраивает фразу; 30 дней — другое окно', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(screen.getByRole('button', { name: 'Сон' })).toHaveAttribute('aria-pressed', 'true')
    expect(headline()).toHaveTextContent('Сон за последние 2 недели — хуже обычного')
    await user.click(screen.getByRole('button', { name: '30 дней' }))
    expect(headline()).toHaveTextContent('Сон за последние 30 дней — как обычно')
  })

  it('нажатие на день открывает его: утро, вечер, теги и ночь словами', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    expect(within(chart()).getAllByRole('button', { name: /сентября/ })).toHaveLength(14)
    await user.click(dayButton(/^ср, 16 сентября: 3,5/))
    const dialog = screen.getByRole('dialog', { name: 'ср, 16 сентября' })
    expect(within(dialog).getByText('Просела ночь: утро ниже вчерашнего вечера на 5,0.')).toBeInTheDocument()
    expect(within(dialog).getByText('алкоголь')).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /сон 2/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /продуктивность 6/ })).toBeInTheDocument()
  })

  it('палец ведёт по графику — день подсвечен с датой, отпустил — открылась шторка этого дня', () => {
    show()
    fireEvent.pointerDown(dayButton(/^пт, 18 сентября/), { pointerId: 1 })
    expect(within(chart()).getByText('пт, 18 сентября · 3,5')).toBeInTheDocument()
    fireEvent.pointerMove(dayButton(/^вс, 20 сентября/), { pointerId: 1 })
    expect(within(chart()).getByText('вс, 20 сентября · 3,5')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.pointerUp(dayButton(/^вс, 20 сентября/), { pointerId: 1 })
    expect(screen.getByRole('dialog', { name: 'вс, 20 сентября' })).toBeInTheDocument()
  })

  it('палец ушёл в прокрутку страницы — шторка не открывается', () => {
    show()
    fireEvent.pointerDown(dayButton(/^пт, 18 сентября/), { pointerId: 1 })
    fireEvent.pointerCancel(dayButton(/^пт, 18 сентября/), { pointerId: 1 })
    fireEvent.pointerUp(dayButton(/^пт, 18 сентября/), { pointerId: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('с клавиатуры: ← → по дням, Enter и пробел открывают; сегодняшний вечер — «ещё не закрыт»', () => {
    show()
    const monday = dayButton(/^пн, 21 сентября/)
    monday.focus()
    fireEvent.keyDown(monday, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(dayButton(/^вт, 22 сентября/))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement!, { key: ' ' })
    expect(within(screen.getByRole('dialog', { name: 'ср, 23 сентября' })).getByText('Вечер ещё не закрыт')).toBeInTheDocument()
  })

  it('шторка прошедшего дня: «Вечер не закрыт», отказ — «без срыва», «срыв» и «не записано»', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocked.challenges = [push, quit]
    /* у отказа срыв — отметка 0, «Да, без» — 1, без ответа — «не записано» (domain/streaks.ts, срез 5а) */
    mocked.entries = { quit: { [key(3)]: 0, [key(4)]: 1 } }
    mocked.logs = mocked.logs.filter((l) => l.day !== key(3))
    show()
    await user.click(dayButton(/^вс, 20 сентября/))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Вечер не закрыт')).toBeInTheDocument()
    expect(within(dialog).getByText('срыв')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^сб, 19 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('без срыва')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^пт, 18 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('не записано')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByText('срыв')).toBeNull()
  })

  it('«ещё ряды» раскрывает живые челленджи под графиком, удалённого там нет', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocked.challenges = [push, gone]
    show()
    const more = screen.getByRole('button', { name: /ещё ряды/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(within(chart()).queryByText('ОТЖ')).not.toBeInTheDocument()
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(chart()).getByText('ОТЖ')).toBeInTheDocument()
    expect(within(chart()).queryByText('УДЛ')).not.toBeInTheDocument()
  })

  it('«Что изменилось» — доли против прошлых 2 недель', () => {
    show()
    const box = screen.getByRole('region', { name: 'Что изменилось' })
    expect(within(box).getByText('«алкоголь»: 7 из 13 вечеров')).toBeInTheDocument()
    expect(within(box).getByText('Плохих ночей: 7 из 14')).toBeInTheDocument()
    expect(within(box).getAllByText('было 0 из 14')).toHaveLength(2)
  })

  it('истории мало — сравнивать не с чем и полоса «пока»', () => {
    mocked.logs = mocked.logs.filter((l) => l.day >= key(15))
    mocked.starts = mocked.starts.filter((s) => s.day >= key(15))
    show()
    expect(within(screen.getByRole('region', { name: 'Что изменилось' })).getByText(/Прошлые 2 недели почти не записаны/)).toBeInTheDocument()
    expect(screen.getByText(/пока по 15 полным дням/)).toBeInTheDocument()
    expect(headline()).toHaveTextContent('Вторая неделя хуже первой')
  })

  it('полных дней в окне мало — вывода нет, и «Что изменилось» не сравнивает пустое', () => {
    mocked.logs = mocked.logs.filter((l) => l.day < key(13) || l.day > key(3))
    mocked.starts = mocked.starts.filter((s) => s.day < key(13) || s.day > key(3))
    show()
    expect(headline()).toHaveTextContent('Полных дней за 2 недели: 2 — для вывода нужно хотя бы 5')
    expect(within(screen.getByRole('region', { name: 'Что изменилось' })).getByText(/Эти 2 недели почти не записаны/)).toBeInTheDocument()
  })

  it('не загрузилось — сообщение вместо обзора', () => {
    mocked.failed = 'logs'
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные')
    expect(screen.queryByTestId('headline')).not.toBeInTheDocument()
  })

  it('внизу — «Челленджи ›» в разбор челленджей', () => {
    show()
    expect(screen.getByRole('link', { name: 'Челленджи ›' })).toHaveAttribute('href', '/analytics/challenges')
  })

  it('челленджей нет — обзор всё равно есть, подсказка про день на месте, внизу — куда идти', () => {
    mocked.challenges = []
    show()
    expect(headline()).toHaveTextContent('хуже обычного')
    expect(screen.getByText('веди пальцем по графику или нажми на день')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Челленджей пока нет/ })).toHaveAttribute('href', '/challenges')
  })
})

/**
 * 60 дней ровных: утро 6, вечер 7, сон 7. Алкоголь — вечерами 4, 13, 22, 31, 40, 49 и 58 дней назад;
 * утро после — 3. В окне связей (56 дней) — шесть утр «с»: 3, 12, 21, 30, 39, 48 дней назад.
 */
function drinkWorld(days = 60) {
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  for (let back = days - 1; back >= 1; back--) {
    const tags = back % 9 === 4 ? ['алкоголь'] : []
    logs.push({ day: key(back), mood: 7, wellbeing: 7, productivity: 6, tags, note: '', closedAt: `${key(back)}T21:00:00.000Z` })
  }
  for (let back = days - 1; back >= 0; back--) {
    const after = (back + 1) % 9 === 4
    starts.push({ day: key(back), morning: { sleep: 7, wellbeing: after ? 3 : 6, mood: after ? 3 : 6 }, startedAt: `${key(back)}T08:00:00.000Z` })
  }
  return { logs, starts }
}

const links = () => screen.getByRole('region', { name: /Что попробовать|Связи: пока рано/ })

describe('AnalyticsPage — связи', () => {
  beforeEach(() => Object.assign(mocked, drinkWorld()))

  it('«Что попробовать»: ведро, тег, точки уверенности и строка с числами; сколько смотрели', () => {
    show()
    const box = screen.getByRole('region', { name: 'Что попробовать' })
    expect(within(box).getByText('Меньше')).toBeInTheDocument()
    expect(within(box).getByText('«алкоголь» вечером')).toBeInTheDocument()
    expect(within(box).getByText('Самочувствие и настроение утром после «алкоголь» — 3,0, без — 6,0. Хуже в 6 из 6 раз.')).toBeInTheDocument()
    expect(within(box).getByText('Смотрели 1 связь, заметных 1.')).toBeInTheDocument()
  })

  it('«заметных» — только то, что видно: вторая связь в том же ведре не считается', () => {
    // «ссора» вечерами 6, 15, … — утро после 4: тоже «Меньше», но слабее алкоголя
    mocked.logs = mocked.logs.map((l) => ([6, 15, 24, 33, 42, 51].map(key).includes(l.day) ? { ...l, tags: ['ссора'] } : l))
    mocked.starts = mocked.starts.map((s) => ([5, 14, 23, 32, 41, 50].map(key).includes(s.day) ? { ...s, morning: { sleep: 7, wellbeing: 4, mood: 4 } } : s))
    show()
    const box = screen.getByRole('region', { name: 'Что попробовать' })
    expect(within(box).getByText('Смотрели 2 связи, заметных 1.')).toBeInTheDocument()
  })

  it('плохая ночь — строкой «Сон» без совета «меньше / больше»; «заметных» её учитывает', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // тегов нет; 1, 9, 17 … дней назад — сон 2 утром и вечер того дня 3
    const nights = [1, 9, 17, 25, 33, 41, 49].map(key)
    mocked.logs = mocked.logs.map((l) => ({ ...l, tags: [], ...(nights.includes(l.day) ? { mood: 3, wellbeing: 3 } : {}) }))
    mocked.starts = mocked.starts.map((s) => ({ ...s, morning: { sleep: nights.includes(s.day) ? 2 : 7, wellbeing: 6, mood: 6 } }))
    show()
    const box = screen.getByRole('region', { name: 'Что попробовать' })
    expect(within(box).getByText('Сон')).toBeInTheDocument()
    expect(within(box).getByText('Плохая ночь')).toBeInTheDocument()
    expect(within(box).getByText('Самочувствие и настроение вечером после плохой ночи — 3,0, без — 7,0. Хуже в 7 из 7 раз.')).toBeInTheDocument()
    expect(within(box).getByText('Смотрели 1 связь, заметных 1.')).toBeInTheDocument()
    expect(screen.queryByText(/заметных пока нет/)).not.toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: /Подробнее/ }))
    expect(screen.getByRole('dialog', { name: 'После плохой ночи самочувствие и настроение вечером обычно хуже' })).toBeInTheDocument()
  })

  it('нажатие на точки объясняет ступень', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    const dots = within(links()).getByRole('button', { name: 'Уверенность: похоже' })
    expect(dots).toHaveTextContent('●○○')
    expect(dots).toHaveAttribute('aria-expanded', 'false')
    await user.click(dots)
    expect(within(links()).getByText(/Видели 5\+ раз «с» и 5\+ «без», разница больше балла\. Может быть и случайно\./)).toBeInTheDocument()
  })

  it('«Подробнее» — карточка связи: заголовок со временем, два числа, случаи, на чём держится', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog', { name: 'После вечера с «алкоголь» самочувствие и настроение на следующее утро обычно хуже' })
    expect(within(dialog).getByText('без «алкоголь» (49)')).toBeInTheDocument()
    expect(within(dialog).getByText('после «алкоголь» (6)')).toBeInTheDocument()
    expect(within(dialog).getByText('Хуже обычного в 6 из 6 раз')).toBeInTheDocument()
    expect(within(dialog).getByText('6 раз «с» и 49 «без». Может быть и случайно.')).toBeInTheDocument()
  })

  it('«Показать эти дни на графике» — окно 30 дней, дни подсвечены, сказано, сколько не влезло', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Показать эти дни на графике' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true')
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(3)
    expect(screen.getByText('Подсвечено 3 дня из 6 — остальные раньше')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Подсвечено 3 дня из 6 — остальные раньше')
    await user.click(screen.getByRole('button', { name: 'Убрать подсветку' }))
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(0)
  })

  it('подсвеченный день так и называется для скринридера; смена цели снимает подсветку', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Показать эти дни на графике' }))
    expect(within(chart()).getAllByRole('button', { name: /подсвечен/ })).toHaveLength(3)
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(0)
    expect(screen.queryByText(/Подсвечено/)).not.toBeInTheDocument()
  })

  it('дней «с» мало — «Связи: пока рано» с прогрессом; вредное — только счётчик', () => {
    mocked.logs = mocked.logs.map((l) => (l.day < key(20) ? { ...l, tags: [] } : l))
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).getByText('Нужно 5 дней «с» и 5 «без» — тогда покажем, что с чем идёт.')).toBeInTheDocument()
    expect(within(box).getByRole('img', { name: '«алкоголь»: с — 2 из 5, без — есть' })).toBeInTheDocument()
    expect(within(box).getByText('«алкоголь» звать не будем — это просто счётчик.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Что попробовать' })).not.toBeInTheDocument()
  })

  it('новый пользователь: записей меньше 14 дней — сказано, сколько ещё', () => {
    Object.assign(mocked, drinkWorld(10))
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).getByText('Записано 10 дней — чтобы искать связи, нужно хотя бы 14.')).toBeInTheDocument()
  })

  it('записей 13 дней, у тега 5 + 5 уже есть — строки прогресса о нём нет, «не хватает −1» не пишем', () => {
    const w = drinkWorld(13)
    // «учёба» — вечерами 1, 3, 5, … дней назад
    const study = [1, 3, 5, 7, 9, 11].map(key)
    mocked.logs = w.logs.map((l) => (study.includes(l.day) ? { ...l, tags: [...l.tags, 'учёба'] } : l))
    mocked.starts = w.starts
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).getByText('Записано 13 дней — чтобы искать связи, нужно хотя бы 14.')).toBeInTheDocument()
    expect(within(box).queryByRole('img', { name: /«учёба»/ })).not.toBeInTheDocument()
    expect(within(box).queryByText(/не хватает -/)).not.toBeInTheDocument()
  })

  it('вечера закрыты реже чем в 70 % дней — сказано, сколько, а не «нужно 5 + 5»', () => {
    // не закрыты вечера 1, 3, 6, 8, 11, 13, … дней назад: закрыто 33 из 55 прошедших дней окна
    const open = Array.from({ length: 55 }, (_, i) => i + 1).filter((b) => b % 5 === 1 || b % 5 === 3).map(key)
    mocked.logs = mocked.logs.filter((l) => !open.includes(l.day))
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).getByText('Вечера закрыты в 60 % дней — чтобы сравнивать «с» и «без», нужно хотя бы 70 %.')).toBeInTheDocument()
    expect(within(box).queryByText(/не хватает -/)).not.toBeInTheDocument()
  })

  it('«не в моих силах» в прогрессе нет: это не будущий совет', () => {
    mocked.logs = mocked.logs.map((l) => (l.day < key(20) ? { ...l, tags: [] } : l.day === key(7) ? { ...l, tags: ['болел'] } : l))
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).queryByRole('img', { name: /«болел»/ })).not.toBeInTheDocument()
    expect(within(box).getByRole('img', { name: /«алкоголь»/ })).toBeInTheDocument()
  })

  it('смотрели, но заметного нет — так и сказано', () => {
    mocked.starts = mocked.starts.map((s) => ({ ...s, morning: { sleep: 7, wellbeing: 6, mood: 6 } }))
    show()
    const box = screen.getByRole('region', { name: 'Связи: пока рано' })
    expect(within(box).getByText('Смотрели 1 связь — заметных пока нет.')).toBeInTheDocument()
  })
})

describe('AnalyticsPage — случаи и «Объясняет плохие дни»', () => {
  it('«Случаи»: редкий тег, после которого оба утра заметно хуже, — без обобщения; дни — на графике', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const w = drinkWorld()
    mocked.logs = w.logs.map((l) => (l.day === key(10) || l.day === key(25) ? { ...l, tags: ['ссора'] } : l))
    mocked.starts = w.starts.map((s) => (s.day === key(9) || s.day === key(24) ? { ...s, morning: { sleep: 7, wellbeing: 2, mood: 2 } } : s))
    show()
    const box = screen.getByRole('region', { name: 'Случаи' })
    expect(within(box).getByText('Случаи · обобщать пока рано')).toBeInTheDocument()
    expect(within(box).getByText('Оба утра после «ссора» самочувствие и настроение — 2 и 2. После других вечеров — около 6.')).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Показать на графике дни после «ссора»' }))
    expect(screen.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true')
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(2)
    expect(screen.getByText('Подсвечено 2 дня')).toBeInTheDocument()
  })

  it('случаев нет — блока нет', () => {
    Object.assign(mocked, drinkWorld())
    show()
    expect(screen.queryByRole('region', { name: 'Случаи' })).not.toBeInTheDocument()
  })

  it('«Объясняет плохие дни»: болел — в плохой день или накануне; это не совет', () => {
    mocked.logs = mocked.logs.map((l) => (l.day === key(7) || l.day === key(5) ? { ...l, tags: [...l.tags, 'болел'] } : l))
    show()
    const box = screen.getByRole('region', { name: 'Объясняет плохие дни' })
    expect(within(box).getByText('Объясняет плохие дни · это не совет')).toBeInTheDocument()
    expect(within(box).getByText('«болел» — 4 дня из 7 плохих')).toBeInTheDocument()
    // по макету ссылка «Челленджи ›» — последней, после всех блоков разбора
    const last = screen.getByRole('link', { name: 'Челленджи ›' })
    expect(box.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('плохих дней с такими тегами нет — блока нет', () => {
    show()
    expect(screen.queryByRole('region', { name: 'Объясняет плохие дни' })).not.toBeInTheDocument()
  })
})

describe('AnalyticsPage — «Что обычно шло следом»', () => {
  /** drinkWorld, но и вечер после алкоголя — 3; спорт после алкоголя пропущен, в остальные дни — сделан. */
  function chainWorld() {
    const w = drinkWorld()
    const afterDays = [3, 12, 21, 30, 39, 48].map(key)
    mocked.logs = w.logs.map((l) => (afterDays.includes(l.day) ? { ...l, mood: 3, wellbeing: 3 } : l))
    mocked.starts = w.starts
    mocked.challenges = [{ ...push, measure: 'binary', goal: 1 }]
    mocked.entries = { push: Object.fromEntries(w.logs.filter((l) => !afterDays.includes(l.day)).map((l) => [l.day, 1])) }
  }

  it('ссылка под «Что попробовать» — после чего и сколько раз', () => {
    chainWorld()
    show()
    expect(within(links()).getByRole('button', { name: /Что обычно шло следом/ })).toHaveTextContent('после вечера с «алкоголь» (6 раз)')
  })

  it('порядок событий: утро, день, вечер против обычного; «как обычно» — серым; не причины', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    chainWorld()
    show()
    await user.click(within(links()).getByRole('button', { name: /Что обычно шло следом/ }))
    const dialog = screen.getByRole('dialog', { name: 'Что обычно шло следом' })
    expect(within(dialog).getByRole('row', { name: /сон 7,0 ≈ как обычно/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /^самочувствие и настроение 3,0 обычно 6,0 · хуже в 6 из 6/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /Отжиматься по 20 раз 0 из 6 обычно 10 из 10/ })).toBeInTheDocument()
    // вечер — тот же, что проверил порог: самочувствие и настроение
    expect(within(dialog).getByRole('row', { name: /^Вечер самочувствие и настроение 3,0 обычно 7,0 · хуже в 6 из 6/ })).toBeInTheDocument()
    expect(within(dialog).getByText(/Это порядок событий, а не цепочка причин/)).toBeInTheDocument()
    expect(within(dialog).getByText('Уверенность ●○○ — 6 раз, это мало.')).toBeInTheDocument()
  })

  it('вечер после не хуже обычного — ссылки нет', () => {
    Object.assign(mocked, drinkWorld())
    show()
    expect(within(links()).queryByRole('button', { name: /Что обычно шло следом/ })).not.toBeInTheDocument()
  })

  it('неотмеченное утро и сравнение «плохая ночь без алкоголя» — отдельными строками', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    chainWorld()
    // утро 12 дней назад (после алкоголя) не записано; 7, 16 и 25 дней назад — плохие ночи без алкоголя, вечер 5
    const badNights = [7, 16, 25].map(key)
    mocked.starts = mocked.starts
      .filter((s) => s.day !== key(12))
      .map((s) => (badNights.includes(s.day) ? { ...s, morning: { sleep: 2, wellbeing: 6, mood: 6 } } : s))
    mocked.logs = mocked.logs.map((l) => (badNights.includes(l.day) ? { ...l, mood: 5, wellbeing: 5 } : l))
    show()
    await user.click(within(links()).getByRole('button', { name: /Что обычно шло следом/ }))
    const dialog = screen.getByRole('dialog', { name: 'Что обычно шло следом' })
    expect(within(dialog).getByText('Ещё 1 раз утро не отмечено.')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Для сравнения: после плохой ночи без «алкоголь» накануне (3 раза) самочувствие и настроение вечером — 5,0.'),
    ).toBeInTheDocument()
  })

  it('цепочка — у сильнейшей карточки', () => {
    chainWorld()
    // «отдых» вечерами 6, 15, … — утро после 8: «Больше», но слабее алкоголя; вечер после — обычный
    mocked.logs = mocked.logs.map((l) => ([6, 15, 24, 33, 42, 51].map(key).includes(l.day) ? { ...l, tags: ['отдых'] } : l))
    mocked.starts = mocked.starts.map((s) => ([5, 14, 23, 32, 41, 50].map(key).includes(s.day) ? { ...s, morning: { sleep: 7, wellbeing: 8, mood: 8 } } : s))
    show()
    expect(within(links()).getByText('«отдых» вечером')).toBeInTheDocument()
    expect(within(links()).getByRole('button', { name: /Что обычно шло следом/ })).toHaveTextContent('после вечера с «алкоголь»')
  })
})

describe('AnalyticsPage — ночь: лёг и встал', () => {
  const night = (bed: number, wake: number) => ({ bed, wake, bedHow: 'exact' as const, wakeHow: 'exact' as const })
  /** world() с ночами: обычно лёг 23:30, встал 7:40; после вечеров с алкоголем (7…1 назад) — 1:30 и 9:00. */
  function nightWorld() {
    const w = world()
    const lateMornings = new Set([6, 5, 4, 3, 2, 1, 0].map(key))
    mocked.starts = w.starts.map((s) =>
      s.morning ? { ...s, morning: { ...s.morning, night: lateMornings.has(s.day) ? night(90, 540) : night(-30, 460) } } : s,
    )
  }

  it('шторка дня: ночь перед ним — «лёг» и «встал» в утре; без записи — прочерк', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    nightWorld()
    mocked.starts = mocked.starts.map((s) => (s.day === key(8) ? { ...s, morning: { ...s.morning!, night: null } } : s))
    show()
    await user.click(dayButton(/^чт, 17 сентября/))
    let dialog = screen.getByRole('dialog', { name: 'чт, 17 сентября' })
    expect(within(dialog).getByRole('row', { name: 'лёг 1:30' })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: 'встал 9:00' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^вт, 15 сентября/))
    dialog = screen.getByRole('dialog', { name: 'вт, 15 сентября' })
    expect(within(dialog).getByRole('row', { name: 'лёг —' })).toBeInTheDocument()
  })

  it('«ещё ряды»: поздний отбой («лёг 00:30+» — не шире колонки подписей) — с часа позже обычного; клетка — у вечера, после которого лёг', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    nightWorld()
    show()
    expect(within(chart()).queryByText('лёг 00:30+')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ещё ряды/ }))
    expect(within(chart()).getByText('лёг 00:30+')).toBeInTheDocument()
    expect(chart().querySelectorAll('[data-late="late"]')).toHaveLength(7)
    expect(chart().querySelectorAll('[data-late="no"]')).toHaveLength(6)
  })

  it('«Что изменилось»: поздних ночей — долей записанных, те же ночи, что в ряду (7 + 6 = 13)', () => {
    nightWorld()
    show()
    const changed = screen.getByRole('region', { name: 'Что изменилось' })
    expect(within(changed).getByText('Отбой с 00:30 и позже: 7 из 13 ночей')).toBeInTheDocument()
  })

  it('ночей всего меньше пяти — ни ряда, ни строки: своего обычного ещё нет', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    nightWorld()
    mocked.starts = mocked.starts.map((s) => (s.day < key(3) && s.morning ? { ...s, morning: { ...s.morning, night: null } } : s))
    show()
    await user.click(screen.getByRole('button', { name: /ещё ряды/ }))
    expect(within(chart()).queryByText(/^лёг \d+:\d+\+$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Отбой с/)).not.toBeInTheDocument()
  })

  /** Ровный мир без тегов; поздние ночи (лёг в 1:00) — перед утрами 5, 13, 21 … 53 дней назад, сон после — 3. */
  function lateWorld() {
    const w = drinkWorld()
    const late = (back: number) => back % 8 === 5
    mocked.logs = w.logs.map((l) => ({ ...l, tags: [] }))
    mocked.starts = w.starts.map((s) => {
      const back = [...Array(60).keys()].find((b) => key(b) === s.day)!
      return { ...s, morning: { sleep: late(back) ? 3 : 7, wellbeing: 6, mood: 6, night: late(back) ? night(60, 460) : night(-30, 460) } }
    })
  }

  it('связь «поздний отбой → сон»: своя строка «Ночь», порог — тот же, что у ряда «лёг 00:30+»; карточка — с порогом', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lateWorld()
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    const box = links()
    expect(within(box).getByText('Ночь')).toBeInTheDocument()
    expect(within(box).queryByText('Меньше')).not.toBeInTheDocument()
    expect(within(box).getByText('Поздний отбой (с 00:30)')).toBeInTheDocument()
    expect(within(box).getByText('Сон утром после позднего отбоя — 3,0, без — 7,0. Хуже в 7 из 7 раз.')).toBeInTheDocument()
    expect(within(box).getByText('Смотрели 1 связь, заметных 1.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ещё ряды/ }))
    expect(within(chart()).getByText('лёг 00:30+')).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog', { name: 'После отбоя с 00:30 и позже сон обычно хуже' })
    expect(within(dialog).getByText('после отбоя раньше 00:30 (48)')).toBeInTheDocument()
    expect(within(dialog).getByText('после отбоя с 00:30 (7)')).toBeInTheDocument()
  })

  /** Страница аналитики и куда ведёт «Попробовать»: на «Челленджах» видно, с каким черновиком пришли. */
  function showRoutes() {
    function Challenges() {
      const state = useLocation().state as { draft?: string } | null
      return <p>{`Челленджи, черновик: ${state?.draft ?? 'нет'}`}</p>
    }
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/analytics/challenges" element={<p>Разбор челленджей</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('«Ночь»: «Попробовать: ложусь раньше» — форма челленджа с черновиком (срез 4б)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lateWorld()
    showRoutes()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    await user.click(within(links()).getByRole('button', { name: 'Попробовать: ложусь раньше' }))
    expect(screen.getByText('Челленджи, черновик: bedtime')).toBeInTheDocument()
  })

  it('«Сон · Плохая ночь»: «Попробовать» — только когда плохие ночи чаще после позднего отбоя', () => {
    const w = drinkWorld()
    const bad = [1, 9, 17, 25, 33, 41, 49].map(key)
    mocked.logs = w.logs.map((l) => ({ ...l, tags: [], ...(bad.includes(l.day) ? { mood: 3, wellbeing: 3 } : {}) }))
    const withNights = (late: boolean) =>
      w.starts.map((s) => {
        const isBad = bad.includes(s.day)
        return { ...s, morning: { sleep: isBad ? 2 : 7, wellbeing: 6, mood: 6, night: late && isBad ? night(60, 460) : night(-30, 460) } }
      })
    mocked.starts = withNights(false)
    showRoutes()
    expect(within(links()).getByText('Плохая ночь')).toBeInTheDocument()
    expect(within(links()).queryByRole('button', { name: 'Попробовать: ложусь раньше' })).toBeNull()
    cleanup()
    // плохие ночи — после позднего отбоя: связь «поздний отбой → сон» есть, кнопка у «Сна» тоже
    mocked.starts = withNights(true)
    showRoutes()
    const box = links()
    expect(within(box).getByText('Плохая ночь')).toBeInTheDocument()
    expect(within(box).queryByText('Ночь')).toBeNull() // на цели «Всё» утро после позднего — как обычно
    expect(within(box).getAllByRole('button', { name: 'Попробовать: ложусь раньше' })).toHaveLength(1)
  })

  it('«Ложусь раньше» уже идёт — вместо «Попробовать» ссылка в разбор челленджей', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lateWorld()
    mocked.challenges = [push, { ...push, id: 'bed', name: 'Ложусь раньше', code: 'ЛР', measure: 'bedtime', goal: -30, unit: '' }]
    showRoutes()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(within(links()).queryByRole('button', { name: 'Попробовать: ложусь раньше' })).toBeNull()
    await user.click(within(links()).getByRole('link', { name: '«Ложусь раньше» уже идёт ›' }))
    expect(screen.getByText('Разбор челленджей')).toBeInTheDocument()
  })

  it('шторка дня: у «Ложусь раньше» — своё время «вечером лёг в …», не путается с «лёг» утра (ревью 4б)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    nightWorld()
    const bed = { ...push, id: 'bed', name: 'Ложусь раньше', code: 'ЛР', measure: 'bedtime' as const, goal: -30, unit: '' }
    mocked.challenges = [bed]
    mocked.entries = { bed: { [key(6)]: -40, [key(5)]: 60, [key(4)]: NaN } }
    show()
    await user.click(dayButton(/^чт, 17 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('вечером лёг в 23:20 ✓')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^пт, 18 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('вечером лёг в 1:00 — позже 23:30')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^сб, 19 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('ночь не записана')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // вчера: сегодняшнее утро ещё не принесло ночь в отметки — «посчитается утром»
    await user.click(dayButton(/^вт, 22 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('посчитается утром')).toBeInTheDocument()
  })

  it('«Ложусь раньше» на паузе — не «уже идёт»: можно попробовать снова (ревью 4б)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lateWorld()
    const bed = { ...push, id: 'bed', name: 'Ложусь раньше', code: 'ЛР', measure: 'bedtime' as const, goal: -30, unit: '' }
    mocked.challenges = [push, { ...bed, pauses: [{ from: key(3), to: null }] }]
    showRoutes()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(within(links()).getByRole('button', { name: 'Попробовать: ложусь раньше' })).toBeInTheDocument()
    cleanup()
    // срок кончился — тоже
    mocked.challenges = [push, { ...bed, startDate: key(40), lengthDays: 30 }]
    showRoutes()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    expect(within(links()).getByRole('button', { name: 'Попробовать: ложусь раньше' })).toBeInTheDocument()
  })

  it('порог один на экран: 30 дней не меняют «с 00:30» ни в ряду, ни в строке «Ночь»', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lateWorld()
    // до 30-дневного окна (44…59 дней назад) ложился в 1:00 и спал на 3 — у окна в 30 дней «обычное» было бы 1:00, порог 2:00
    mocked.starts = mocked.starts.map((s) => {
      const back = [...Array(60).keys()].find((b) => key(b) === s.day)!
      return back >= 44 ? { ...s, morning: { ...s.morning!, sleep: 3, night: night(60, 460) } } : s
    })
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    await user.click(screen.getByRole('button', { name: '30 дней' }))
    await user.click(screen.getByRole('button', { name: /ещё ряды/ }))
    expect(within(chart()).getByText('лёг 00:30+')).toBeInTheDocument()
    expect(within(links()).getByText('Поздний отбой (с 00:30)')).toBeInTheDocument()
  })

  it('порядок: карточки ведер, «Ночь», «Сон»; «Показать эти дни» — только у «Сна»', () => {
    const w = drinkWorld()
    // цель «Всё»: алкоголь (утро после — 3) + поздние ночи перед утрами 5, 13 … (утро 3) + плохие ночи 1, 9 … (вечер 3)
    const late = [5, 13, 21, 29, 37, 45, 53].map(key)
    const bad = [1, 9, 17, 25, 33, 41, 49].map(key)
    mocked.logs = w.logs.map((l) => (bad.includes(l.day) ? { ...l, mood: 3, wellbeing: 3 } : l))
    mocked.starts = w.starts.map((s) => {
      const m = s.morning!
      const isLate = late.includes(s.day)
      return {
        ...s,
        morning: {
          ...m,
          sleep: bad.includes(s.day) ? 2 : 7,
          wellbeing: isLate ? 3 : m.wellbeing,
          mood: isLate ? 3 : m.mood,
          night: isLate ? night(60, 460) : night(-30, 460),
        },
      }
    })
    show()
    const box = links()
    const [less, n, s] = ['Меньше', 'Ночь', 'Сон'].map((t) => within(box).getByText(t))
    expect(less.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(n.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(box).getAllByRole('button', { name: 'Показать эти дни на графике' })).toHaveLength(1)
    expect(within(box).getByText('Смотрели 3 связи, заметных 3.')).toBeInTheDocument()
  })

  it('«Сон · Плохая ночь» — «Показать эти дни на графике» прямо в строке', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, drinkWorld())
    const nights = [1, 9, 17, 25, 33, 41, 49].map(key)
    mocked.logs = mocked.logs.map((l) => ({ ...l, tags: [], ...(nights.includes(l.day) ? { mood: 3, wellbeing: 3 } : {}) }))
    mocked.starts = mocked.starts.map((s) => ({ ...s, morning: { sleep: nights.includes(s.day) ? 2 : 7, wellbeing: 6, mood: 6 } }))
    show()
    await user.click(within(links()).getByRole('button', { name: 'Показать эти дни на графике' }))
    expect(screen.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true')
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(4)
    expect(screen.getByRole('status')).toHaveTextContent('Подсвечено 4 дня из 7 — остальные раньше')
  })

  it('«Что обычно шло следом»: ночью — лёг, утром — встал, против обычного', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const w = drinkWorld()
    const afterDays = [3, 12, 21, 30, 39, 48].map(key)
    mocked.logs = w.logs.map((l) => (afterDays.includes(l.day) ? { ...l, mood: 3, wellbeing: 3 } : l))
    mocked.starts = w.starts.map((s) =>
      s.morning ? { ...s, morning: { ...s.morning, night: afterDays.includes(s.day) ? night(90, 540) : night(-30, 460) } } : s,
    )
    show()
    await user.click(within(links()).getByRole('button', { name: /Что обычно шло следом/ }))
    const dialog = screen.getByRole('dialog', { name: 'Что обычно шло следом' })
    expect(within(dialog).getByRole('row', { name: 'Ночь лёг 1:30 обычно 23:30 · позже в 6 из 6' })).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: 'встал 9:00 обычно 7:40 · позже в 6 из 6' })).toBeInTheDocument()
    const rows = within(dialog).getAllByRole('row').map((r) => r.textContent)
    expect(rows.findIndex((t) => t?.includes('лёг'))).toBe(0)
    expect(rows.findIndex((t) => t?.includes('встал'))).toBe(rows.findIndex((t) => t?.startsWith('Утросон')) + 1)
  })
})

describe('AnalyticsPage — ступени тегов (срез 5б)', () => {
  it('шторка дня: тег со ступенью — пилюля «алкоголь · 3–5 порций» (long), тег без ступени — как было', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // back=7 — «плохой» день из world(), уже с тегом «алкоголь»; добавляем ступень 2 и тег без ступени
    mocked.logs = mocked.logs.map((l) => (l.day === key(7) ? { ...l, tags: ['алкоголь', 'дорога'], levels: { алкоголь: 2 } } : l))
    show()
    await user.click(dayButton(/^ср, 16 сентября/))
    const dialog = screen.getByRole('dialog', { name: 'ср, 16 сентября' })
    expect(within(dialog).getByText('алкоголь · 3–5 порций')).toBeInTheDocument()
    expect(within(dialog).getByText('дорога')).toBeInTheDocument()
  })

  /**
   * drinkWorld, но теги и утра переопределены целиком, чтобы точно знать ступени и «обычное».
   * «1–2» — вечера 13…16 (результаты 12…15, утро 5, n = 4), «3–5» — вечера 18…19 (результаты 17…18,
   * утро 4, n = 2 — ниже LADDER_MIN, «мало дней»), «6+» — вечера 20…22 (результаты 19…21, утро 2,
   * n = 3 — ровно на границе LADDER_MIN, среднее уже есть), без ступени — вечера 26…28 (результаты
   * 25…27, утро 3, «не указано»). Остальные дни — «не было», утро 6 ровно. Окно связей — последние
   * 56 дней истории: 55 пар (i = 1…55), «с» — 4 + 2 + 3 + 3 = 12 (= LADDER_TOTAL), «без» — 55 − 12 = 43.
   * Фраза (§4): связь maybe/worse; withN 12 ≥ 12 (граница); показаны 1–2 и 6+ (n 4 и 3); видимые 6,0 ≥ 5,0 ≥ 2,0;
   * |2,0 − 5,0| = 3; условие 6 — результаты «3–5» (сб 05.09, вс 06.09) только в выходные, в слое одна ступень, он
   * пропущен; будни 4×(1; 5) + 3×(3; 2): b = −1,5, SSE = 0 → se = 0, span = −3, shrunk = −3 → «хуже».
   * firstLikeNone: |5,0 − 6,0| = 1 не меньше LINK_DIFF → false.
   */
  function doseWorld() {
    const w = drinkWorld()
    const lvl1 = [13, 14, 15, 16]
    const lvl2 = [18, 19]
    const lvl3 = [20, 21, 22]
    const none = [26, 27, 28]
    const allEvenings = [...lvl1, ...lvl2, ...lvl3, ...none]
    const evenings = new Set(allEvenings.map(key))
    const logs = w.logs.map((l) => {
      if (!evenings.has(l.day)) return { ...l, tags: [] }
      const back = allEvenings.find((b) => key(b) === l.day)!
      const levels = lvl1.includes(back) ? { алкоголь: 1 } : lvl2.includes(back) ? { алкоголь: 2 } : lvl3.includes(back) ? { алкоголь: 3 } : {}
      return { ...l, tags: ['алкоголь'], levels }
    })
    const r1 = new Set(lvl1.map((b) => key(b - 1)))
    const r2 = new Set(lvl2.map((b) => key(b - 1)))
    const r3 = new Set(lvl3.map((b) => key(b - 1)))
    const rn = new Set(none.map((b) => key(b - 1)))
    const starts = w.starts.map((s) => {
      const v = r1.has(s.day) ? 5 : r2.has(s.day) ? 4 : r3.has(s.day) ? 2 : rn.has(s.day) ? 3 : 6
      return { ...s, morning: { sleep: 7, wellbeing: v, mood: v } }
    })
    return { logs, starts }
  }

  /**
   * Своя, более простая раскладка (только ступени 1 и 3, без ступени 2): «1–2» — вечера 13…17 (результат —
   * утро 5, n = 5), «6+» — вечера 20…24 (утро 2, n = 5), без ступени — только вечер 27 (утро 3, n = 1).
   * «с» = 5 + 5 + 1 = 11 — ниже LADDER_TOTAL (12): лесенка (группа «Сколько») есть, а фразы
   * «Чем больше…» нет. Остальные условия выполнены: показаны 1–2 и 6+ (n 5 и 5); 6,0 ≥ 5,0 ≥ 2,0; разница 3;
   * все 10 результатов со ступенью — будни, b = −1,5, shrunk = −3. Отказ даёт только условие 2.
   */
  function doseWorldFew() {
    const w = drinkWorld()
    const lvl1 = [13, 14, 15, 16, 17]
    const lvl3 = [20, 21, 22, 23, 24]
    const none = [27]
    const allEvenings = [...lvl1, ...lvl3, ...none]
    const evenings = new Set(allEvenings.map(key))
    const logs = w.logs.map((l) => {
      if (!evenings.has(l.day)) return { ...l, tags: [] }
      const back = allEvenings.find((b) => key(b) === l.day)!
      const levels = lvl1.includes(back) ? { алкоголь: 1 } : lvl3.includes(back) ? { алкоголь: 3 } : {}
      return { ...l, tags: ['алкоголь'], levels }
    })
    const r1 = new Set(lvl1.map((b) => key(b - 1)))
    const r3 = new Set(lvl3.map((b) => key(b - 1)))
    const rn = new Set(none.map((b) => key(b - 1)))
    const starts = w.starts.map((s) => {
      const v = r1.has(s.day) ? 5 : r3.has(s.day) ? 2 : rn.has(s.day) ? 3 : 6
      return { ...s, morning: { sleep: 7, wellbeing: v, mood: v } }
    })
    return { logs, starts }
  }

  it('«Подробнее» у «алкоголь»: группа «Сколько» — ступени по порядку и со своими числами, «мало дней» ровно у редкой, фраза «Чем больше — тем хуже.»', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, doseWorld())
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog')
    const group = within(dialog).getByRole('group', { name: 'Сколько' })
    // порядок строк и число привязано к своей строке — не «где-то в группе»
    expect(group.textContent).toMatch(
      /не было \(43\)\s*6,0.*1–2 порции \(4\)\s*5,0.*3–5 порций \(2\)\s*мало дней.*6\+ порций \(3\)\s*2,0.*сколько — не указано \(3\)/s,
    )
    // «мало дней» — только у ступени 2 (n = 2 < LADDER_MIN); у «не указано» (n = 3) среднего нет вовсе
    expect(within(group).getAllByText('мало дней')).toHaveLength(1)
    expect(within(group).queryByText('4,0')).not.toBeInTheDocument()
    expect(within(group).queryByText('3,0')).not.toBeInTheDocument()
    /* у «не указано» среднего нет ни отдельным узлом, ни в одной строке с подписью (перепроверка 5б) */
    expect(group.textContent).not.toMatch(/не указано \(3\)\s*\d/)
    expect(within(dialog).getByText('Чем больше — тем хуже.')).toBeInTheDocument()
    // |5,0 − 6,0| = 1 — не меньше LINK_DIFF: «почти как без» нет
    expect(within(dialog).queryByText(/почти как без/)).not.toBeInTheDocument()
  })

  it('лесенка есть, но фразы «Чем больше…» нет — вечеров с тегом меньше LADDER_TOTAL', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, doseWorldFew())
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('group', { name: 'Сколько' })).toBeInTheDocument()
    expect(within(dialog).queryByText(/Чем больше/)).not.toBeInTheDocument()
  })

  it('лесенка — по выбранной цели: на «Сне» ступени считаются по сну, а не по самочувствию и настроению (ревью 5б)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, doseWorld())
    // сон после ступеней — свой: «1–2» → 4, «3–5» → 3, «6+» → 1, без ступени → 2, остальное → 7 (на «Всё» было 5 / 4 / 2 / 3 / 6)
    const sleepOf = (v: number) => (v === 5 ? 4 : v === 4 ? 3 : v === 2 ? 1 : v === 3 ? 2 : 7)
    mocked.starts = mocked.starts.map((s) => (s.morning ? { ...s, morning: { ...s.morning, sleep: sleepOf(s.morning.wellbeing) } } : s))
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const group = within(screen.getByRole('dialog')).getByRole('group', { name: 'Сколько' })
    // «не было» 7,0 · «1–2» (4) 4,0 · «6+» (3) 1,0 — числа сна; по «Всё» было бы 6,0 · 5,0 · 2,0
    expect(group.textContent).toMatch(/не было \(43\)\s*7,0.*1–2 порции \(4\)\s*4,0.*6\+ порций \(3\)\s*1,0/s)
  })

  it('лесенка — снимок на момент открытия, как и сама связь: пришли новые записи — числа в открытой шторке прежние (ревью 5б)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, doseWorld())
    const { rerender } = show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const group = () => within(screen.getByRole('dialog')).getByRole('group', { name: 'Сколько' })
    expect(group().textContent).toMatch(/1–2 порции \(4\)/)
    // с другого устройства у одного вечера «1–2» сняли ступень: в свежей истории «1–2» — 3 дня, «не указано» — 4
    mocked.logs = mocked.logs.map((l) => (l.day === key(13) ? { ...l, levels: {} } : l))
    rerender(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    )
    // шторка показывает тот же снимок, что и полоски «без / после» над ней
    expect(group().textContent).toMatch(/1–2 порции \(4\)/)
    expect(group().textContent).toMatch(/не указано \(3\)/)
  })

  it('у «алкоголь» ещё ни одного вечера со ступенью — блока «Сколько» нет (решение Georgy 25.09)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, drinkWorld())
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('после «алкоголь» (6)')).toBeInTheDocument()
    expect(within(dialog).queryByRole('group', { name: 'Сколько' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/мало дней/)).not.toBeInTheDocument()
  })

  it('связь по тегу не из LEVELS («ссора») — блока «Сколько» в шторке нет', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const w = drinkWorld()
    // «ссора» — единственный тег дня (пришла на смену «алкоголь» из drinkWorld); 5 + 5, утро после хуже
    const evenings = [6, 15, 24, 33, 42, 51].map(key)
    const results = [5, 14, 23, 32, 41, 50].map(key)
    mocked.logs = w.logs.map((l) => (evenings.includes(l.day) ? { ...l, tags: ['ссора'] } : { ...l, tags: [] }))
    mocked.starts = w.starts.map((s) => (results.includes(s.day) ? { ...s, morning: { sleep: 7, wellbeing: 4, mood: 4 } } : s))
    show()
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('group', { name: 'Сколько' })).not.toBeInTheDocument()
  })

  it('«Подробнее» у «Плохая ночь» — в шторке тоже нет блока «Сколько» (это не тег)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const w = drinkWorld()
    const nights = [1, 9, 17, 25, 33, 41, 49].map(key)
    mocked.logs = w.logs.map((l) => ({ ...l, tags: [], ...(nights.includes(l.day) ? { mood: 3, wellbeing: 3 } : {}) }))
    mocked.starts = w.starts.map((s) => ({ ...s, morning: { sleep: nights.includes(s.day) ? 2 : 7, wellbeing: 6, mood: 6 } }))
    show()
    await user.click(within(screen.getByRole('region', { name: 'Что попробовать' })).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog', { name: 'После плохой ночи самочувствие и настроение вечером обычно хуже' })
    expect(within(dialog).queryByRole('group', { name: 'Сколько' })).not.toBeInTheDocument()
  })

  it('«Подробнее» у «Поздний отбой» — в шторке тоже нет блока «Сколько» (это не тег)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const w = drinkWorld()
    const nightFn = (bed: number, wake: number) => ({ bed, wake, bedHow: 'exact' as const, wakeHow: 'exact' as const })
    const late = (back: number) => back % 8 === 5
    mocked.logs = w.logs.map((l) => ({ ...l, tags: [] }))
    mocked.starts = w.starts.map((s) => {
      const back = [...Array(60).keys()].find((b) => key(b) === s.day)!
      return { ...s, morning: { sleep: late(back) ? 3 : 7, wellbeing: 6, mood: 6, night: late(back) ? nightFn(60, 460) : nightFn(-30, 460) } }
    })
    show()
    await user.click(within(screen.getByRole('group', { name: 'Цель' })).getByRole('button', { name: 'Сон' }))
    await user.click(within(links()).getByRole('button', { name: /Подробнее/ }))
    const dialog = screen.getByRole('dialog', { name: 'После отбоя с 00:30 и позже сон обычно хуже' })
    expect(within(dialog).queryByRole('group', { name: 'Сколько' })).not.toBeInTheDocument()
  })

  /**
   * drinkWorld, но теги переопределены: «6+» — 2 вечера (backs 10, 20 → результаты 9, 19). cases() идёт от
   * старых дней к новым: вечер 20 старше вечера 10, поэтому первым в values идёт утро key(19), вторым —
   * key(9); чтобы текст остался «— 3 и 4», key(19) → утро 3, key(9) → утро 4.
   * «1–2» — ещё 3 вечера (backs 30, 32, 34) без выдающихся утр — держат весь тег «алкоголь» вне случаев
   * (эпизодов у целого тега 5 ≥ LINK_MIN, «случаем» не становится). Остальные утра — 7 ровно, «обычное» — 7.
   */
  function topLevelCaseWorld() {
    const w = drinkWorld()
    const top = [10, 20].map(key)
    const pad = [30, 32, 34].map(key)
    const logs = w.logs.map((l) =>
      top.includes(l.day)
        ? { ...l, tags: ['алкоголь'], levels: { алкоголь: 3 } }
        : pad.includes(l.day)
          ? { ...l, tags: ['алкоголь'], levels: { алкоголь: 1 } }
          : { ...l, tags: [] },
    )
    const starts = w.starts.map((s) => {
      if (s.day === key(9)) return { ...s, morning: { sleep: 7, wellbeing: 4, mood: 4 } }
      if (s.day === key(19)) return { ...s, morning: { sleep: 7, wellbeing: 3, mood: 3 } }
      return { ...s, morning: { sleep: 7, wellbeing: 7, mood: 7 } }
    })
    return { logs, starts }
  }

  it('«Случаи»: верхняя ступень «алкоголь · 6+» — своя строка и кнопка со ступенью в названии', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, topLevelCaseWorld())
    show()
    const box = screen.getByRole('region', { name: 'Случаи' })
    expect(
      within(box).getByText('Оба утра после «алкоголь · 6+» самочувствие и настроение — 3 и 4. После других вечеров — около 7.'),
    ).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Показать на графике дни после «алкоголь · 6+»' }))
    expect(screen.getByRole('button', { name: '30 дней' })).toHaveAttribute('aria-pressed', 'true')
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(2)
  })

  /** «алкоголь» — единственный тег дня, только 2 вечера (10, 25), оба ступени 3: тег целиком — уже случай. */
  function wholeTagIsCaseWorld() {
    const w = drinkWorld()
    const only = [10, 25].map(key)
    const logs = w.logs.map((l) => (only.includes(l.day) ? { ...l, tags: ['алкоголь'], levels: { алкоголь: 3 } } : { ...l, tags: [] }))
    const starts = w.starts.map((s) => (s.day === key(9) || s.day === key(24) ? { ...s, morning: { sleep: 7, wellbeing: 2, mood: 2 } } : s))
    return { logs, starts }
  }

  it('тег целиком — случай на тех же днях, что верхняя ступень: строки «алкоголь · 6+» нет', async () => {
    Object.assign(mocked, wholeTagIsCaseWorld())
    show()
    const box = screen.getByRole('region', { name: 'Случаи' })
    expect(
      within(box).getByText('Оба утра после «алкоголь» самочувствие и настроение — 2 и 2. После других вечеров — около 6.'),
    ).toBeInTheDocument()
    expect(within(box).queryByText(/алкоголь · 6\+/)).not.toBeInTheDocument()
    expect(within(box).queryByRole('button', { name: /алкоголь · 6\+/ })).not.toBeInTheDocument()
  })
})

describe('AnalyticsPage — блоки разбора свёрнуты, «Что попробовать» — под графиком (решение Georgy 25.09)', () => {
  const region = (name: string | RegExp) => screen.getByRole('region', { name })
  /** Кнопка в заголовке блока; свёрнут ли — проверяет сама: тесты ниже начинают со свёрнутых. */
  const header = (name: string | RegExp) => {
    const button = within(within(region(name)).getByRole('heading', { level: 2 })).getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    return button
  }
  const before = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const ill = () => {
    mocked.logs = mocked.logs.map((l) => (l.day === key(7) || l.day === key(5) ? { ...l, tags: [...l.tags, 'болел'] } : l))
  }
  const quarrel = () => {
    const w = drinkWorld()
    mocked.logs = w.logs.map((l) => (l.day === key(10) || l.day === key(25) ? { ...l, tags: ['ссора'] } : l))
    mocked.starts = w.starts.map((s) => (s.day === key(9) || s.day === key(24) ? { ...s, morning: { sleep: 7, wellbeing: 2, mood: 2 } } : s))
  }

  it('открыл аналитику — у блоков видны только заголовки, содержимого нет; фраза и график открыты', () => {
    ill()
    showFolded()
    expect(headline()).toHaveTextContent('хуже обычного')
    expect(chart().querySelector('[data-fold]')).toBeNull()
    expect(header('Что изменилось')).toHaveTextContent('Что изменилось')
    expect(screen.queryByText('«алкоголь»: 7 из 13 вечеров')).not.toBeInTheDocument()
    expect(header('Объясняет плохие дни')).toHaveTextContent('Объясняет плохие дни · это не совет')
    expect(screen.queryByText('«болел» — 4 дня из 7 плохих')).not.toBeInTheDocument()
    expect(header(/Что попробовать|Связи: пока рано/)).toBeInTheDocument()
    expect(screen.queryByText(/^Смотрели /)).not.toBeInTheDocument()
  })

  it('«Случаи» и «Что попробовать» тоже свёрнуты', () => {
    quarrel()
    showFolded()
    expect(header('Случаи')).toHaveTextContent('Случаи · обобщать пока рано')
    expect(screen.queryByText(/Оба утра после «ссора»/)).not.toBeInTheDocument()
    expect(header('Что попробовать')).toHaveTextContent('Что попробовать')
    expect(screen.queryByText('«алкоголь» вечером')).not.toBeInTheDocument()
  })

  it('«Связи: пока рано» свёрнуты так же', () => {
    Object.assign(mocked, drinkWorld(20))
    showFolded()
    expect(header('Связи: пока рано')).toHaveTextContent('Связи: пока рано')
    expect(screen.queryByText(/Нужно 5 дней «с» и 5 «без»/)).not.toBeInTheDocument()
  })

  it('нажатие на заголовок раскрывает блок, повторное — сворачивает', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.assign(mocked, drinkWorld())
    showFolded()
    const button = header('Что попробовать')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(region('Что попробовать')).getByText('«алкоголь» вечером')).toBeInTheDocument()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('«алкоголь» вечером')).not.toBeInTheDocument()
  })

  it('раскрытый блок не сворачивается сам при смене периода', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    showFolded()
    await user.click(header('Что изменилось'))
    await user.click(screen.getByRole('button', { name: '30 дней' }))
    expect(within(within(region('Что изменилось')).getByRole('heading', { level: 2 })).getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(within(region('Что изменилось')).getByText(/Против прошлых 30 дней/)).toBeInTheDocument()
  })

  it('порядок: график, «Что попробовать», «Что изменилось», «Объясняет плохие дни», «Челленджи ›»', () => {
    ill()
    showFolded()
    before(chart(), region(/Что попробовать|Связи: пока рано/))
    before(region(/Что попробовать|Связи: пока рано/), region('Что изменилось'))
    before(region('Что изменилось'), region('Объясняет плохие дни'))
    before(region('Объясняет плохие дни'), screen.getByRole('link', { name: 'Челленджи ›' }))
  })

  it('порядок: «Что попробовать» выше «Что изменилось», «Случаи» — после «Что изменилось»', () => {
    quarrel()
    showFolded()
    before(region('Что попробовать'), region('Что изменилось'))
    before(region('Что изменилось'), region('Случаи'))
  })
})
