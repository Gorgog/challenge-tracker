import type { ChallengeEffect } from '@/domain/effects'
import { MIN_EARLY } from '@/domain/stats'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'
import { STRENGTH_WORD, daysText, signed } from './words'

const codes = (list: Challenge[]) => list.map((c) => c.code).join(', ')

/** Как называются дни группы: формы для «учтено N …» и «учтённых … пока нет», глагол при одном. */
type Noun = { one: string; few: string; many: string; verb: 'Учтён' | 'Учтено' }

const MISSES: Noun = { one: 'пропуск', few: 'пропуска', many: 'пропусков', verb: 'Учтён' }
const RELAPSES: Noun = { one: 'срыв', few: 'срыва', many: 'срывов', verb: 'Учтён' }
const HITS: Noun = { one: 'выполнение', few: 'выполнения', many: 'выполнений', verb: 'Учтено' }
const HELD: Noun = { one: 'выдержанный день', few: 'выдержанных дня', many: 'выдержанных дней', verb: 'Учтён' }

/**
 * Сколько дней группы учтено и сколько нужно. «Учтено», а не «было»: день старта, вчерашний день и
 * дни болезни в расчёт не идут, поэтому учтённых бывает меньше, чем видно в календаре.
 */
function shortOf(noun: Noun, count: number): string {
  if (count === 0) return `Учтённых ${noun.many} пока нет — дни не с чем сравнить.`
  const verb = count === 1 ? noun.verb : 'Учтено'
  return `${verb} ${count} ${plural(count, noun.one, noun.few, noun.many)} — для сравнения нужно хотя бы ${MIN_EARLY}.`
}

/** Почему дни «с» и «без» не с чем сравнить — по тому, чего на самом деле не хватает, с числами. */
function reason({ challenge, days, windows, beforeAfter }: ChallengeEffect): string {
  const { withDays, withoutDays } = windows.day.same
  const quit = challenge.kind === 'quit'
  if (days === 0 || beforeAfter?.sinceStart === 0) return 'Челлендж только начат — сравнивать пока не с чем.'
  if (withDays >= MIN_EARLY && withoutDays >= MIN_EARLY) {
    /* Дней хватает, а модель не решается: выполнения легли слишком ровным рисунком. */
    const pattern = quit ? 'срывы и выдержанные дни' : 'выполнения и пропуски'
    return `Дни пока не разделить: ${pattern} идут слишком ровным рисунком — нужны дни, которые из него выбиваются.`
  }
  if (withoutDays < MIN_EARLY && withDays >= MIN_EARLY) return shortOf(quit ? RELAPSES : MISSES, withoutDays)
  if (withDays < MIN_EARLY && withoutDays >= MIN_EARLY) return shortOf(quit ? HELD : HITS, withDays)
  const groups = quit
    ? `без срыва — ${withDays}, со срывом — ${withoutDays}`
    : `с выполнением — ${withDays}, без — ${withoutDays}`
  return `${plural(days, 'Учтён', 'Учтено', 'Учтено')} ${daysText(days)}: ${groups}. Для сравнения нужно хотя бы по ${MIN_EARLY}.`
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
