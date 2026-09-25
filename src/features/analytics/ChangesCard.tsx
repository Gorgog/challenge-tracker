import type { ChangeLine, Changes } from '@/domain/overview'
import { BAD_SLEEP } from '@/domain/timeline'
import { clockText } from '@/domain/night'
import { plural } from '@/lib/plural'
import { Fold } from './Fold'

/** Строка словами и «было»; `up` — доля выросла. Числа — те же, что сравнивало правило. */
function line(l: ChangeLine): { text: string; was: string; up: boolean } {
  if (l.kind === 'challenge') {
    return {
      text: `${l.challenge.name}: ${l.hits} из ${l.known}`,
      was: `было ${l.wasHits} из ${l.wasKnown}`,
      up: l.hits / Math.max(1, l.known) > l.wasHits / Math.max(1, l.wasKnown),
    }
  }
  const text =
    l.kind === 'tag'
      ? `«${l.tag}»: ${l.now} из ${l.of} ${plural(l.of, 'вечера', 'вечеров', 'вечеров')}`
      : l.kind === 'badSleep'
        ? `Плохих ночей: ${l.now} из ${l.of}`
        : l.kind === 'lateBed'
          ? `Отбой с ${clockText(l.from)} и позже: ${l.now} из ${l.of} ${plural(l.of, 'ночи', 'ночей', 'ночей')}`
          : `Пропущено утр: ${l.now} из ${l.of}`
  return { text, was: `было ${l.was} из ${l.wasOf}`, up: l.now / Math.max(1, l.of) > l.was / Math.max(1, l.wasOf) }
}

/** «Что изменилось» — факты против прошлого периода, без выводов о причинах. */
export function ChangesCard({ changes, len }: { changes: Changes; len: number }) {
  const [prev, cur, prevOf] = len === 14 ? ['Прошлые 2 недели', 'Эти 2 недели', 'прошлых 2 недель'] : [`Прошлые ${len} дней`, `Эти ${len} дней`, `прошлых ${len} дней`]
  return (
    <Fold label="Что изменилось" title="Что изменилось">
      {changes.status !== 'ok' ? (
        <p className="text-[14px] text-muted-foreground">{changes.status === 'prevEmpty' ? prev : cur} почти не записаны — сравнивать не с чем.</p>
      ) : !changes.lines.length ? (
        <p className="text-[14px] text-muted-foreground">По записям почти как {prevOf.replace('прошлых', 'прошлые').replace('недель', 'недели')}.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {changes.lines.map((l, i) => {
            const { text, was, up } = line(l)
            const tone = l.good === null ? 'text-muted-foreground' : l.good ? 'text-better' : 'text-worse'
            return (
              <li key={i} className="grid grid-cols-[1.1em_1fr_auto] items-baseline gap-2 text-[15px]">
                <span aria-hidden className={`font-bold ${tone}`}>
                  {up ? '▲' : '▼'}
                </span>
                <span>{text}</span>
                <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">{was}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[12px] text-muted-foreground">
        Против {prevOf}, долей записанных дней; плохая ночь — сон 0–{BAD_SLEEP}. Это факты из записей — без выводов о причинах.
      </p>
    </Fold>
  )
}
