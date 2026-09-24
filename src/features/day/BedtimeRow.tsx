import type { CSSProperties } from 'react'
import { MoonIcon } from 'lucide-react'
import { clockText } from '@/domain/night'
import type { Challenge } from '@/domain/types'

/**
 * «Ложусь раньше» на экране дня (срез 4б): отметки нет — выполнение считается из «Лёг», записанного утром.
 * Сегодняшний день узнается завтра, поэтому строка говорит про вчерашний отбой.
 * `yesterday` — отбой ночи после вчерашнего вечера: нет — сегодня ещё не начато, NaN — ночь не записана;
 * `yesterdayCounts` — вчера челлендж уже шёл.
 */
export function BedtimeRow({ challenge, yesterday, yesterdayCounts }: { challenge: Challenge; yesterday: number | undefined; yesterdayCounts: boolean }) {
  const last =
    yesterday === undefined
      ? 'вчера — посчитается, когда начнёшь день'
      : Number.isNaN(yesterday)
        ? 'вчера — ночь не записана'
        : `вчера лёг в ${clockText(yesterday)}${yesterday <= challenge.goal ? ' ✓' : ' — позже'}`
  return (
    <div
      style={{ '--c': challenge.color } as CSSProperties}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-card p-3 px-4"
    >
      <span aria-hidden className="grid size-9 place-items-center rounded-[10px] border-2 border-dashed border-input text-muted-foreground">
        <MoonIcon className="size-[16px]" />
      </span>
      <div>
        <div className="text-[14.5px] font-medium">{`${challenge.name} · до ${clockText(challenge.goal)}`}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {yesterdayCounts ? `Сегодня посчитается завтра утром · ${last}` : 'Сегодня посчитается завтра утром'}
        </div>
      </div>
    </div>
  )
}
