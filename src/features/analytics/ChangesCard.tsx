import type { ChangeLine, Changes } from '@/domain/overview'
import { BAD_SLEEP } from '@/domain/timeline'
import { plural } from '@/lib/plural'

function line(l: ChangeLine): { text: string; was: string; up: boolean } {
  if (l.kind === 'tag') return { text: `«${l.tag}»: ${l.now} ${plural(l.now, 'вечер', 'вечера', 'вечеров')}`, was: `было ${l.was}`, up: l.now > l.was }
  if (l.kind === 'badSleep') return { text: `Плохих ночей (сон 0–${BAD_SLEEP}): ${l.now}`, was: `было ${l.was}`, up: l.now > l.was }
  return {
    text: `${l.challenge.name}: ${l.hits} из ${l.known}`,
    was: `было ${l.wasHits} из ${l.wasKnown}`,
    up: l.good,
  }
}

/** «Что изменилось» — факты против прошлого периода, без выводов о причинах. */
export function ChangesCard({ changes, len }: { changes: Changes; len: number }) {
  const prev = len === 14 ? 'прошлые 2 недели' : `прошлые ${len} дней`
  return (
    <section aria-label="Что изменилось" className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <h2 className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">Что изменилось</h2>
      {!changes.hasPrev ? (
        <p className="text-[14px] text-muted-foreground">{prev[0]!.toUpperCase() + prev.slice(1)} почти не записаны — сравнивать не с чем.</p>
      ) : !changes.lines.length ? (
        <p className="text-[14px] text-muted-foreground">По записям почти как {prev}.</p>
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
      <p className="text-[12px] text-muted-foreground">Против {prev.replace('прошлые', 'прошлых').replace('недели', 'недель')}. Это факты из записей — без выводов о причинах.</p>
    </section>
  )
}
