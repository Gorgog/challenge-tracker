import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Shift, TimelineDay } from '@/domain/timeline'
import type { Challenge, Outcome } from '@/domain/types'
import { clockText } from '@/domain/night'
import { levelLabel } from '@/domain/tags'
import { dayName, shiftText } from './words'

/**
 * У «Ложусь раньше» — своё время со словом «вечером»: это ночь после вечера дня, а строка «лёг» выше — ночь перед
 * ним (ревью 4б, решение Georgy). Ночь не записана или ещё узнается утром — так и сказано.
 */
const bedtimeText = (c: Challenge, o: Outcome, bed: number | undefined) =>
  o === 'unknown' || bed === undefined || Number.isNaN(bed)
    ? o === 'pending' ? 'посчитается утром' : 'ночь не записана'
    : `вечером лёг в ${clockText(bed)}${o === 'hit' ? ' ✓' : ` — позже ${clockText(c.goal)}`}`

const outcomeText = (c: Challenge, o: Outcome, bed: number | undefined) =>
  c.measure === 'bedtime'
    ? bedtimeText(c, o, bed)
    : o === 'pending'
      ? 'день ещё идёт'
      : o === 'unknown'
        ? 'не записано'
        : c.kind === 'quit'
        ? o === 'hit' ? 'без срыва' : 'срыв'
        : o === 'hit' ? 'выполнен' : 'пропущен'

/**
 * Тег со ступенью — полной подписью: «алкоголь · 3–5 порций» (срез 5б). Без ступени — просто тег: «было, сколько —
 * не указано».
 */
const tagText = (tag: string, levels: Record<string, number> | undefined) => {
  const level = levelLabel(tag, levels?.[tag], 'long')
  return level ? `${tag} · ${level}` : tag
}

/** Один день целиком: ночь перед ним, утро, вечер, теги и отметки челленджей. Пустое — прочерком, а не нулём. */
export function DaySheet({
  day,
  isToday,
  shift,
  challenges,
  outcomeOf,
  valueOf,
  onClose,
}: {
  day: TimelineDay | null
  isToday: boolean
  /** Ночь и день словами (`dayShift`). */
  shift: Shift
  challenges: Challenge[]
  outcomeOf: (c: Challenge, day: string) => Outcome
  /** Значение отметки дня — у «Ложусь раньше» это отбой ночи после вечера. */
  valueOf: (c: Challenge, day: string) => number | undefined
  onClose: () => void
}) {
  const m = day?.morning ?? null
  const e = day?.evening ?? null
  const v = (x: number | undefined) => (x === undefined ? '—' : String(x))
  const n = m?.night ?? null
  const rows: [string, string, string][] = [
    ['лёг', n ? clockText(n.bed) : '—', ''],
    ['встал', n ? clockText(n.wake) : '—', ''],
    ['сон', m ? v(m.sleep) : '—', ''],
    ['самочувствие', m ? v(m.wellbeing) : '—', e ? v(e.wellbeing) : '—'],
    ['настроение', m ? v(m.mood) : '—', e ? v(e.mood) : '—'],
    ['продуктивность', '', e ? v(e.productivity) : '—'],
  ]
  const marks = day ? challenges.map((c) => [c, outcomeOf(c, day.day)] as const).filter(([, o]) => o !== 'outside') : []

  return (
    <Dialog open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-4 sm:max-w-sm">
        {day && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight">{dayName(day.day)}</DialogTitle>
              <DialogDescription>Утро, вечер и отметки этого дня.</DialogDescription>
            </DialogHeader>
            {shiftText(shift) && <p className="text-[14px]">{shiftText(shift)}</p>}
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="text-left font-normal" />
                  <th className="text-right font-normal">утро</th>
                  <th className="text-right font-normal">вечер</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, a, b]) => (
                  <tr key={label}>
                    <td className="py-0.5">{label}</td>
                    <td className="text-right font-mono">{a}</td>
                    <td className="text-right font-mono">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!m && !shift && <p className="text-[13px] text-muted-foreground">День ещё не начат</p>}
            {!e && <p className="text-[13px] text-muted-foreground">{isToday ? 'Вечер ещё не закрыт' : 'Вечер не закрыт'}</p>}
            {e && (
              <div className="flex flex-wrap gap-1.5">
                {day.tags.length ? (
                  day.tags.map((t) => (
                    <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-[12.5px] text-secondary-foreground">
                      {tagText(t, day.levels)}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-muted-foreground">Тегов не было</span>
                )}
              </div>
            )}
            {marks.length > 0 && (
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {marks.map(([c, o]) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span>{c.name}</span>
                    <span className={o === 'hit' ? 'text-better' : o === 'miss' ? 'text-worse' : 'text-muted-foreground'}>{outcomeText(c, o, day ? valueOf(c, day.day) : undefined)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
