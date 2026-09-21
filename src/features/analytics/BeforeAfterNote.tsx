import type { ChallengeEffect } from '@/domain/effects'
import { MIN_GROUP } from '@/domain/stats'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'
import { STRENGTH_WORD, daysText, signed } from './words'

const codes = (list: Challenge[]) => list.map((c) => c.code).join(', ')

/** Почему дни «с» и «без» не с чем сравнить — по тому, чего на самом деле не хватает. */
function reason({ challenge, days, windows, beforeAfter }: ChallengeEffect): string {
  const { withDays, withoutDays } = windows.day.same
  const quit = challenge.kind === 'quit'
  if (days === 0 || beforeAfter?.sinceStart === 0) return 'Челлендж только начат — сравнивать пока не с чем.'
  if (withoutDays < MIN_GROUP && withDays >= MIN_GROUP) {
    return `${quit ? 'Срывов' : 'Пропусков'} почти нет — дни не с чем сравнить.`
  }
  if (withDays < MIN_GROUP && withoutDays >= MIN_GROUP) {
    return `${quit ? 'Выдержанных дней' : 'Выполнений'} почти нет — дни не с чем сравнить.`
  }
  return 'Оценённых дней пока мало — дни не с чем сравнить.'
}

/** Запасное сравнение для челленджа, у которого дни «с» и «без» не набрать. */
export function BeforeAfterNote({ effect }: { effect: ChallengeEffect }) {
  const ba = effect.beforeAfter
  const why = reason(effect)

  if (!ba || ba.span === 0 || ba.byMetric.day.strength === 'few') {
    const more =
      !ba || ba.sinceStart === 0
        ? ''
        : ba.beforeStart === 0
          ? ' И до старта оценок нет — сравнить «до и после» тоже не с чем.'
          : ' Для сравнения до и после старта пока мало оценённых дней.'
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {why}
        {more}
      </p>
    )
  }

  const day = ba.byMetric.day
  const alongside = ba.overlaps.filter((c) => !ba.inseparableFrom.includes(c))

  return (
    <div className="flex flex-col gap-1.5 text-[12.5px]">
      <p className="text-muted-foreground">
        {why} Сравниваю {daysText(ba.span)} до и после старта.
      </p>
      <p>
        Оценка дня после старта:{' '}
        <span className="font-mono tabular-nums">{signed(day.delta)}</span> — {STRENGTH_WORD[day.strength]}{' '}
        <span className="font-mono text-[10.5px] text-muted-foreground">
          ({ba.daysAfter} и {ba.daysBefore} {plural(ba.daysBefore, 'день', 'дня', 'дней')})
        </span>
      </p>
      {ba.inseparableFrom.length > 0 && (
        <p>
          В те же дни {ba.inseparableFrom.length > 1 ? 'начаты' : 'начат'} {codes(ba.inseparableFrom)} — чей это
          эффект, не сказать.
        </p>
      )}
      {alongside.length > 0 && (
        <p className="text-muted-foreground">В эти недели начаты или закончены: {codes(alongside)}.</p>
      )}
      <p className="text-muted-foreground">
        Сильнее «похоже» такое сравнение не бывает: челлендж обычно начинают после плохой полосы, и
        возврат к норме выглядит как эффект.
      </p>
    </div>
  )
}
