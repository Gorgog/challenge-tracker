import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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

const show = () =>
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  )
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

  it('шторка прошедшего дня: «Вечер не закрыт», отказ — «без срыва» и «срыв»', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocked.challenges = [push, quit]
    /* у отказа срыв — отметка 0 (domain/streaks.ts) */
    mocked.entries = { quit: { [key(3)]: 0 } }
    mocked.logs = mocked.logs.filter((l) => l.day !== key(3))
    show()
    await user.click(dayButton(/^вс, 20 сентября/))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Вечер не закрыт')).toBeInTheDocument()
    expect(within(dialog).getByText('срыв')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(dayButton(/^сб, 19 сентября/))
    expect(within(screen.getByRole('dialog')).getByText('без срыва')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Убрать подсветку' }))
    expect(chart().querySelectorAll('[data-highlight]')).toHaveLength(0)
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
    expect(within(box).getByText('Оба утра после «ссора» самочувствие и настроение — 2 и 2. Твоё обычное — около 6.')).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Показать эти дни на графике' }))
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
  })

  it('плохих дней с такими тегами нет — блока нет', () => {
    show()
    expect(screen.queryByRole('region', { name: 'Объясняет плохие дни' })).not.toBeInTheDocument()
  })
})
