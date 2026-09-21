import type { Challenge } from '@/domain/types'
import type { BeforeAfter } from '@/domain/effects'
import { plural } from '@/lib/plural'
import { STRENGTH_WORD, daysText, signed } from './words'

type BeforeAfterNoteProps = { challenge: Challenge; beforeAfter: BeforeAfter | null }

const codes = (list: Challenge[]) => list.map((c) => c.code).join(', ')

/** Запасное сравнение для челленджа, у которого дни «с» и «без» не набрать. */
export function BeforeAfterNote({ challenge, beforeAfter: ba }: BeforeAfterNoteProps) {
  const why = challenge.kind === 'quit' ? 'Срывов почти нет' : 'Пропусков почти нет'

  if (!ba || ba.span === 0 || ba.byMetric.day.strength === 'few') {
    const reason =
      !ba || ba.daysBefore === 0
        ? 'И до старта оценок нет — сравнить «до и после» тоже не с чем.'
        : 'Для сравнения до и после старта пока мало оценённых дней.'
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {why} — дни не с чем сравнить. {reason}
      </p>
    )
  }

  const day = ba.byMetric.day
  const alongside = ba.overlaps.filter((c) => !ba.inseparableFrom.includes(c))

  return (
    <div className="flex flex-col gap-1.5 text-[12.5px]">
      <p className="text-muted-foreground">
        {why} — дни не с чем сравнить. Сравниваю {daysText(ba.span)} до и после старта.
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
