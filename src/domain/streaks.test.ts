import { describe, expect, it } from 'vitest'
import { dayKey, parseDay } from './date'
import { activeDays, bestStreak, completionRate, currentStreak, dayOutcome, fullDays, lastDay } from './streaks'
import type { Challenge, EntryMap } from './types'

const TODAY = parseDay('2026-09-21')

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    name: 'Читать 20 страниц',
    code: 'ЧТН',
    kind: 'do',
    measure: 'binary',
    goal: 1,
    unit: null,
    color: 'var(--chart-1)',
    tagIds: [],
    startDate: '2026-09-01',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 0,
    ...over,
  }
}

/** Отметки из строки вида '1101' начиная с указанного дня. */
function entriesFrom(start: string, pattern: string): EntryMap {
  const map: EntryMap = {}
  let d = parseDay(start)
  for (const ch of pattern) {
    if (ch !== '.') map[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = Number(ch)
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  }
  return map
}

describe('dayOutcome', () => {
  const c = challenge()

  it('день до старта челленджа не считается', () => {
    expect(dayOutcome(c, {}, parseDay('2026-08-31'), TODAY)).toBe('outside')
  })

  it('день после конца ограниченного челленджа не считается', () => {
    const limited = challenge({ startDate: '2026-09-01', lengthDays: 5 })
    expect(dayOutcome(limited, {}, parseDay('2026-09-06'), TODAY)).toBe('outside')
    expect(dayOutcome(limited, {}, parseDay('2026-09-05'), TODAY)).not.toBe('outside')
  })

  it('привычка: отметка есть — цель взята', () => {
    expect(dayOutcome(c, entriesFrom('2026-09-10', '1'), parseDay('2026-09-10'), TODAY)).toBe('hit')
  })

  it('привычка: прошедший день без отметки — пропуск', () => {
    expect(dayOutcome(c, {}, parseDay('2026-09-10'), TODAY)).toBe('miss')
  })

  it('привычка: сегодня без отметки — день ещё идёт, это не пропуск', () => {
    expect(dayOutcome(c, {}, TODAY, TODAY)).toBe('pending')
  })

  it('счётный челлендж сравнивает значение с целью', () => {
    const steps = challenge({ measure: 'count', goal: 10000 })
    expect(dayOutcome(steps, { '2026-09-10': 10_000 }, parseDay('2026-09-10'), TODAY)).toBe('hit')
    expect(dayOutcome(steps, { '2026-09-10': 9_999 }, parseDay('2026-09-10'), TODAY)).toBe('miss')
  })

  it('счётный челлендж: сегодня ниже цели — всё ещё идёт день', () => {
    const steps = challenge({ measure: 'count', goal: 10000 })
    expect(dayOutcome(steps, { '2026-09-21': 7_240 }, TODAY, TODAY)).toBe('pending')
  })

  it('отказ: день без записи засчитывается сам', () => {
    const quit = challenge({ kind: 'quit', name: 'Без сигарет' })
    expect(dayOutcome(quit, {}, parseDay('2026-09-10'), TODAY)).toBe('hit')
    expect(dayOutcome(quit, {}, TODAY, TODAY)).toBe('hit')
  })

  it('отказ: ноль — это отмеченный срыв', () => {
    const quit = challenge({ kind: 'quit' })
    expect(dayOutcome(quit, { '2026-09-10': 0 }, parseDay('2026-09-10'), TODAY)).toBe('miss')
  })
})

describe('currentStreak', () => {
  it('считает непрерывную серию привычки', () => {
    const c = challenge()
    expect(currentStreak(c, entriesFrom('2026-09-18', '1111'), TODAY)).toBe(4)
  })

  it('незакрытая сегодня привычка не рвёт серию: день ещё идёт', () => {
    const c = challenge()
    // 18, 19, 20 выполнены, 21 (сегодня) ещё не отмечен
    expect(currentStreak(c, entriesFrom('2026-09-18', '111'), TODAY)).toBe(3)
  })

  it('пропуск вчера обнуляет серию', () => {
    const c = challenge()
    expect(currentStreak(c, entriesFrom('2026-09-17', '111.'), TODAY)).toBe(0)
  })

  it('отказ: день без срыва идёт в серию сразу, включая сегодня', () => {
    const quit = challenge({ kind: 'quit', startDate: '2026-09-01' })
    expect(currentStreak(quit, {}, TODAY)).toBe(21) // с 1 по 21 сентября
  })

  it('отказ: срыв сегодня рвёт серию в тот же день', () => {
    const quit = challenge({ kind: 'quit', startDate: '2026-09-01' })
    expect(currentStreak(quit, { '2026-09-21': 0 }, TODAY)).toBe(0)
  })

  it('отказ: считает дни после последнего срыва', () => {
    const quit = challenge({ kind: 'quit', startDate: '2026-09-01' })
    expect(currentStreak(quit, { '2026-09-15': 0 }, TODAY)).toBe(6) // 16..21
  })

  it('серия не уходит за дату старта', () => {
    const c = challenge({ startDate: '2026-09-19' })
    expect(currentStreak(c, entriesFrom('2026-09-19', '111'), TODAY)).toBe(3)
  })
})

describe('bestStreak', () => {
  it('находит самую длинную серию за всё время', () => {
    const c = challenge()
    const entries = entriesFrom('2026-09-10', '11111.11')
    expect(bestStreak(c, entries, TODAY)).toBe(5)
  })

  it('учитывает текущую серию, если она самая длинная', () => {
    const c = challenge()
    expect(bestStreak(c, entriesFrom('2026-09-16', '.11111'), TODAY)).toBe(5)
  })

  it('без единой отметки лучшая серия — ноль', () => {
    expect(bestStreak(challenge(), {}, TODAY)).toBe(0)
  })
})

describe('completionRate', () => {
  it('доля выполненных дней за всё время', () => {
    const c = challenge({ startDate: '2026-09-17' })
    // 17, 18, 19, 20 прошли: выполнено два дня из четырёх
    expect(completionRate(c, entriesFrom('2026-09-17', '11..'), TODAY)).toBeCloseTo(0.5)
  })

  it('сегодняшний день в долю не входит — он ещё не закончен', () => {
    const c = challenge({ startDate: '2026-09-20' })
    expect(completionRate(c, entriesFrom('2026-09-20', '1.'), TODAY)).toBe(1)
  })

  it('можно ограничить последними N днями', () => {
    const c = challenge({ startDate: '2026-08-01' })
    const entries = entriesFrom('2026-09-18', '111')
    expect(completionRate(c, entries, TODAY, 3)).toBe(1)
  })

  it('без прошедших дней возвращает ноль, а не делит на ноль', () => {
    const c = challenge({ startDate: '2026-09-21' })
    expect(completionRate(c, {}, TODAY)).toBe(0)
  })
})

describe('activeDays', () => {
  it('отдаёт прошедшие дни челленджа без сегодняшнего', () => {
    const c = challenge({ startDate: '2026-09-18' })
    expect(activeDays(c, TODAY)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20'])
  })

  it('ограниченный челлендж заканчивается своей длиной', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 3 })
    expect(activeDays(c, TODAY)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })
})

describe('fullDays', () => {
  it('считает дни, в которые закрыты все привычки', () => {
    const a = challenge({ id: 'a', startDate: '2026-09-18' })
    const b = challenge({ id: 'b', startDate: '2026-09-18' })
    const entries = {
      a: entriesFrom('2026-09-18', '111'),
      b: entriesFrom('2026-09-18', '11.'),
    }
    expect(fullDays([a, b], entries, TODAY, 7)).toBe(2)
  })

  it('день без единого активного челленджа не считается полным', () => {
    const a = challenge({ id: 'a', startDate: '2026-09-20' })
    expect(fullDays([a], { a: entriesFrom('2026-09-20', '1') }, TODAY, 7)).toBe(1)
  })
})

/** Момент удаления — локальный полдень нужного дня: день не зависит от часового пояса. */
const deletedOn = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12).toISOString()
}

describe('удалённый челлендж в статистике', () => {
  it('до удаления его пропуски по-прежнему портят день, после — нет', () => {
    const kept = challenge()
    const deleted = challenge({ id: 'gone', deletedAt: deletedOn('2026-09-15') })
    const entries = { c1: entriesFrom('2026-09-14', '1111111'), gone: {} }

    /* 14 и 15 сентября у удалённого пропуски — дни не полные: отфильтруй его целиком, и история
       задним числом стала бы лучше, чем была. С 16-го его уже нет, и дни он не портит. */
    expect(fullDays([kept, deleted], entries, TODAY, 7)).toBe(5)
  })

  it('день удаления — последний день челленджа, дальше он вне', () => {
    const c = challenge({ deletedAt: deletedOn('2026-09-15') })
    expect(dayOutcome(c, {}, parseDay('2026-09-15'), TODAY)).toBe('miss')
    expect(dayOutcome(c, {}, parseDay('2026-09-16'), TODAY)).toBe('outside')
  })

  it('у отказа дни после удаления — не «выдержан», а вне челленджа', () => {
    const quit = challenge({ kind: 'quit', deletedAt: deletedOn('2026-09-15') })
    expect(dayOutcome(quit, {}, parseDay('2026-09-16'), TODAY)).toBe('outside')
  })

  it('прошедшие дни удалённого — по день удаления включительно', () => {
    const c = challenge({ startDate: '2026-09-12', deletedAt: deletedOn('2026-09-15') })
    expect(activeDays(c, TODAY)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'])
  })
})

describe('пауза', () => {
  it('день паузы у привычки — вне челленджа, а не пропуск', () => {
    const c = challenge({ pauses: [{ from: '2026-09-10', to: '2026-09-12' }] })
    expect(dayOutcome(c, {}, parseDay('2026-09-11'), TODAY)).toBe('outside')
    expect(dayOutcome(c, {}, parseDay('2026-09-13'), TODAY)).toBe('miss')
  })

  it('день паузы у отказа — вне челленджа, а не выдержанный день', () => {
    const quit = challenge({ kind: 'quit', pauses: [{ from: '2026-09-10', to: '2026-09-12' }] })
    expect(dayOutcome(quit, {}, parseDay('2026-09-11'), TODAY)).toBe('outside')
  })

  it('незакрытая пауза выключает и сегодняшний день', () => {
    const c = challenge({ pauses: [{ from: '2026-09-15', to: null }] })
    expect(dayOutcome(c, {}, TODAY, TODAY)).toBe('outside')
  })

  it('дни паузы не входят в прошедшие дни челленджа', () => {
    const c = challenge({ startDate: '2026-09-15', pauses: [{ from: '2026-09-17', to: '2026-09-18' }] })
    expect(activeDays(c, TODAY)).toEqual(['2026-09-15', '2026-09-16', '2026-09-19', '2026-09-20'])
  })

  it('пауза отодвигает финиш ограниченного челленджа на свою длину', () => {
    const c = challenge({
      startDate: '2026-09-01',
      lengthDays: 10,
      pauses: [{ from: '2026-09-04', to: '2026-09-08' }],
    })
    // 10 дней челленджа + 5 дней паузы
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-15')
    expect(dayOutcome(c, {}, parseDay('2026-09-15'), TODAY)).toBe('miss')
    expect(dayOutcome(c, {}, parseDay('2026-09-16'), TODAY)).toBe('outside')
  })

  it('пауза после финиша срок не меняет', () => {
    const c = challenge({
      startDate: '2026-09-01',
      lengthDays: 5,
      pauses: [{ from: '2026-09-10', to: '2026-09-12' }],
    })
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-05')
  })

  it('пока пауза не закрыта, финиша у ограниченного челленджа нет', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 30, pauses: [{ from: '2026-09-10', to: null }] })
    expect(lastDay(c)).toBeNull()
  })

  it('пауза замораживает серию: 12 дней, пауза, ещё день — 13', () => {
    const c = challenge({ startDate: '2026-09-01', pauses: [{ from: '2026-09-13', to: '2026-09-19' }] })
    const entries = { ...entriesFrom('2026-09-01', '111111111111'), ...entriesFrom('2026-09-20', '1') }
    expect(currentStreak(c, entries, TODAY)).toBe(13)
  })

  it('на незакрытой паузе серия стоит на месте', () => {
    const c = challenge({ startDate: '2026-09-01', pauses: [{ from: '2026-09-11', to: null }] })
    expect(currentStreak(c, entriesFrom('2026-09-01', '1111111111'), TODAY)).toBe(10)
  })

  it('лучшая серия склеивается через паузу', () => {
    const c = challenge({ startDate: '2026-09-01', pauses: [{ from: '2026-09-04', to: '2026-09-06' }] })
    const entries = { ...entriesFrom('2026-09-01', '111'), ...entriesFrom('2026-09-07', '11') }
    expect(bestStreak(c, entries, TODAY)).toBe(5)
  })

  it('пауза не снижает процент выполнения', () => {
    const c = challenge({ startDate: '2026-09-17', pauses: [{ from: '2026-09-19', to: '2026-09-20' }] })
    expect(completionRate(c, entriesFrom('2026-09-17', '11'), TODAY)).toBe(1)
  })
})

describe('пауза и финиш — крайние случаи', () => {
  it('пауза с первого дня отодвигает финиш так же, как любая другая', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 5, pauses: [{ from: '2026-09-01', to: '2026-09-02' }] })
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-07')
  })

  it('пауза, накрывшая финиш, переносит его за своё окончание', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 5, pauses: [{ from: '2026-09-04', to: '2026-09-10' }] })
    // 1–3 сентября, пауза 4–10, ещё два дня: 11 и 12
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-12')
  })

  it('две паузы складываются', () => {
    const c = challenge({
      startDate: '2026-09-01',
      lengthDays: 4,
      pauses: [
        { from: '2026-09-02', to: '2026-09-02' },
        { from: '2026-09-04', to: '2026-09-05' },
      ],
    })
    // активные дни: 1, 3, 6, 7
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-07')
  })

  it('пауза, назначенная на завтра, тоже снимает финиш, пока не закрыта', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 30, pauses: [{ from: '2026-09-22', to: null }] })
    expect(lastDay(c)).toBeNull()
  })

  it('незакрытая пауза после финиша финиш не трогает — челлендж уже закончился', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 5, pauses: [{ from: '2026-09-10', to: null }] })
    expect(dayKey(lastDay(c) as Date)).toBe('2026-09-05')
  })

  it('огромный срок считается без перебора дней — опечатка в сроке не вешает экран', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 3_000_000 })
    expect(currentStreak(c, entriesFrom('2026-09-01', '1'.repeat(20)), TODAY)).toBe(20)
    expect(dayKey(lastDay(c) as Date)).toBe(dayKey(new Date(2026, 8, 1 + 2_999_999)))
  })

  it('кривой срок из испорченных данных считается бессрочным, а не зацикливает', () => {
    expect(lastDay(challenge({ lengthDays: 2.5 }))).toBeNull()
    expect(lastDay(challenge({ lengthDays: -3 }))).toBeNull()
  })

  it('серия отказа тоже замирает на паузе', () => {
    const quit = challenge({
      kind: 'quit',
      startDate: '2026-09-01',
      pauses: [{ from: '2026-09-10', to: '2026-09-15' }],
    })
    // срыв 5-го; выдержаны 6–9 и 16–21 — десять дней, пауза между ними не в счёт
    expect(currentStreak(quit, { '2026-09-05': 0 }, TODAY)).toBe(10)
  })

  it('окно процента — последние N календарных дней, а не N дней челленджа', () => {
    const c = challenge({ startDate: '2026-08-01', pauses: [{ from: '2026-09-10', to: '2026-09-19' }] })
    // за последнюю неделю (14–20 сентября) челлендж шёл только 20-го, и он выполнен;
    // окно «7 дней челленджа» утащило бы невыполненные дни начала сентября
    expect(completionRate(c, entriesFrom('2026-09-20', '1'), TODAY, 7)).toBe(1)
  })
})

describe('финиш по паузам — ветки расчёта', () => {
  const five = (pauses: { from: string; to: string | null }[]) =>
    challenge({ startDate: '2026-09-01', lengthDays: 5, pauses })
  const finish = (c: Challenge) => {
    const end = lastDay(c)
    return end ? dayKey(end) : null
  }

  it('перекрытые паузы не сдвигают финиш дважды', () => {
    expect(finish(five([{ from: '2026-09-02', to: '2026-09-06' }, { from: '2026-09-04', to: '2026-09-08' }]))).toBe('2026-09-12')
  })

  it('пауза внутри другой паузы ничего не добавляет', () => {
    expect(finish(five([{ from: '2026-09-02', to: '2026-09-08' }, { from: '2026-09-04', to: '2026-09-05' }]))).toBe('2026-09-12')
  })

  it('пауза целиком до старта срок не трогает', () => {
    expect(finish(five([{ from: '2026-08-20', to: '2026-08-25' }]))).toBe('2026-09-05')
  })

  it('порядок пауз в данных не важен — хранилище может отдать их как угодно', () => {
    expect(finish(five([{ from: '2026-09-06', to: '2026-09-06' }, { from: '2026-09-02', to: '2026-09-03' }]))).toBe('2026-09-08')
  })

  it('незакрытая пауза с самого дня финиша снимает финиш', () => {
    expect(finish(five([{ from: '2026-09-05', to: null }]))).toBeNull()
  })

  it('сдвинутый финиш догоняет следующую паузу — и она тоже сдвигает', () => {
    const c = challenge({
      startDate: '2026-09-01',
      lengthDays: 4,
      pauses: [
        { from: '2026-09-02', to: '2026-09-02' },
        { from: '2026-09-05', to: '2026-09-05' },
      ],
    })
    expect(finish(c)).toBe('2026-09-06')
  })

  it('огромный срок: пауза сдвигает финиш и там, где год уже пятизначный', () => {
    const c = challenge({ startDate: '2026-09-01', lengthDays: 3_000_000, pauses: [{ from: '2026-09-10', to: '2026-09-19' }] })
    expect(finish(c)).toBe(dayKey(new Date(2026, 8, 1 + 2_999_999 + 10)))
  })

  it('срок за пределами календаря считается бессрочным, а не даёт битую дату', () => {
    expect(lastDay(challenge({ startDate: '2026-09-01', lengthDays: 1e9 }))).toBeNull()
  })
})
