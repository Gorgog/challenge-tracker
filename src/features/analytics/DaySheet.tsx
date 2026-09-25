import { useState, type ReactNode } from 'react'
import { CalendarIcon, ChevronDownIcon, LightbulbIcon, MoonIcon, SunIcon, WineIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isHarmful, type DayStory } from '@/domain/dayStory'
import { isComplete, type Goal } from '@/domain/overview'
import type { Shift, TimelineDay } from '@/domain/timeline'
import type { Challenge, Outcome } from '@/domain/types'
import { clockText } from '@/domain/night'
import { levelLabel } from '@/domain/tags'
import { cn } from '@/lib/utils'
import { LEVEL } from './linkWords'
import { guessText, laterText, toneText } from './storyWords'
import { dayName, num1, shiftText } from './words'

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

/** Тег — обведённый чип; тот, что может утянуть вниз, — оранжевый (поправка Georgy 25.09: «цвета сливаются»). */
function TagChip({ tag, levels }: { tag: string; levels: Record<string, number> | undefined }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[12.5px]',
        isHarmful(tag) ? 'border-warn/45 bg-warn/10 text-warn' : 'border-foreground/25 bg-foreground/5 text-foreground',
      )}
    >
      {tagText(tag, levels)}
    </span>
  )
}

/** Челлендж дня — своим чипом: ✓ выполнен (синий), ✗ пропущен (оранжевый). */
function MarkChip({ name, hit }: { name: string; hit: boolean }) {
  return (
    <span
      className={cn(
        'rounded-md border px-2 py-0.5 text-[12.5px]',
        hit ? 'border-better/40 bg-better/10 text-better' : 'border-worse/40 bg-worse/10 text-worse',
      )}
    >
      {`${hit ? '✓' : '✗'} ${name}`}
    </span>
  )
}

const Note = ({ text }: { text: string }) => (
  <p className="border-l-2 border-foreground/25 pl-2.5 text-[13px] text-muted-foreground italic">{`«${text}»`}</p>
)

const LINE =
  '[&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-8 [&:not(:last-child)]:before:bottom-1 [&:not(:last-child)]:before:left-[15.5px] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-foreground/20'

const withValue = (label: string, v: number | null) => (v === null ? label : `${label} · ${num1(v)}`)

/**
 * Шаг ленты: значок на общей линии, подпись слева и оценка справа, под ними — что было. `warn` — то, что могло
 * утянуть вниз. Скринридеру подпись с оценкой — одной строкой.
 */
function Step({ icon, label, value = null, warn = false, children }: { icon: ReactNode; label: string; value?: number | null; warn?: boolean; children?: ReactNode }) {
  return (
    <li className={cn('relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-5 last:pb-0', LINE)}>
      <span
        aria-hidden
        className={cn(
          'grid size-8 place-items-center rounded-full border [&_svg]:size-4',
          warn ? 'border-warn/50 bg-warn/15 text-warn' : 'border-foreground/20 bg-card text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-2 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="sr-only">{withValue(label, value)}</span>
          <span aria-hidden className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          {value !== null && (
            <span aria-hidden className="font-mono text-[14px] font-semibold tabular-nums">
              {num1(value)}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  )
}

const Chips = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>

/** Группа внутри шага — своей мелкой подписью: теги, пропущено, выполнено, заметка (поправка Georgy 25.09). */
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] text-muted-foreground">{title}</span>
    {children}
  </div>
)

/**
 * Один день лентой (решение Georgy 25.09, макет одобрен): сверху точка дня против обычного, дальше по порядку —
 * вечер накануне, ночь, утро, вечер; одна догадка; все оценки и отметки — свёрнуты. Пустое — прочерком, а не нулём.
 */
export function DaySheet({
  day,
  story,
  goal,
  isToday,
  shift,
  challenges,
  outcomeOf,
  valueOf,
  onClose,
}: {
  day: TimelineDay | null
  /** Лента дня (`dayStory`) по выбранной цели. */
  story: DayStory | null
  goal: Goal
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
  /* «Ложусь раньше» — со своим временем: это ночь после вечера, а строка «ночь» выше — до утра (ревью 4б, Opus 25.09) */
  const chipName = (c: Challenge) => {
    const bed = day && c.measure === 'bedtime' ? valueOf(c, day.day) : undefined
    return bed === undefined || Number.isNaN(bed) ? c.name : `${c.name} · вечером лёг в ${clockText(bed)}`
  }
  const pick = (o: Outcome, quit: boolean) => marks.filter(([c, x]) => x === o && (c.kind === 'quit') === quit).map(([c]) => chipName(c))
  /* у отказа — «срыв» и «без срыва», у привычки — «пропущено» и «выполнено» */
  const groups = [
    { title: 'пропущено', names: pick('miss', false), hit: false },
    { title: 'срыв', names: pick('miss', true), hit: false },
    { title: 'выполнено', names: pick('hit', false), hit: true },
    { title: 'без срыва', names: pick('hit', true), hit: true },
  ].filter((g) => g.names.length > 0)
  const partial = day && story && story.value !== null && !isComplete(day, goal) ? (day.morning ? 'утро' : 'вечер') : null
  const [all, setAll] = useState(false)
  const tone = story ? toneText(story) : null

  return (
    <Dialog
      open={day !== null}
      onOpenChange={(o) => {
        if (o) return
        setAll(false)
        onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-sm">
        {day && story && (
          <>
            <DialogHeader className="flex-row items-center gap-3 text-left">
              <span
                data-testid="day-value"
                data-partial={partial ? '' : undefined}
                className={cn(
                  'grid size-13 shrink-0 place-items-center rounded-[14px] border text-[20px] font-semibold tabular-nums',
                  story.tone === 'worse'
                    ? 'border-worse/45 bg-worse/15 text-worse'
                    : story.tone === 'better'
                      ? 'border-better/45 bg-better/15 text-better'
                      : partial
                        ? 'border-dashed border-muted-foreground/50 bg-transparent text-muted-foreground'
                        : 'border-border bg-secondary text-foreground',
                )}
              >
                {story.value === null ? '—' : num1(story.value)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="text-lg font-bold tracking-tight">{dayName(day.day)}</DialogTitle>
                <DialogDescription className="text-[13px]">
                  {partial ? `записан наполовину: только ${partial}` : (tone ?? 'Как прошёл этот день')}
                </DialogDescription>
              </div>
            </DialogHeader>

            <ul aria-label="Как прошёл день" className="flex flex-col pt-1">
              {story.before && (
                <Step icon={<WineIcon />} label="вечер накануне" value={story.before.value} warn={story.before.harmful.length > 0}>
                  {story.before.tags.length > 0 ? (
                    <Chips>
                      {story.before.tags.map((t) => (
                        <TagChip key={t} tag={t} levels={story.before!.levels} />
                      ))}
                    </Chips>
                  ) : (
                    <p className="text-[13.5px] text-muted-foreground">тегов не было</p>
                  )}
                </Step>
              )}
              {story.night && (
                <Step icon={<MoonIcon />} label="ночь" warn={story.night.late}>
                  <p className="text-[14px]">{`лёг в ${clockText(story.night.bed)}${laterText(story.night.later)}`}</p>
                </Step>
              )}
              <Step icon={<SunIcon />} label="утро" value={story.morning?.value ?? null}>
                {!story.morning ? (
                  <p className="text-[13.5px] text-muted-foreground">{day.started ? 'пропущено' : 'день не начат'}</p>
                ) : (
                  story.morning.note && <Note text={story.morning.note} />
                )}
              </Step>
              <Step icon={<CalendarIcon />} label="вечер" value={story.evening?.value ?? null}>
                {!story.evening && <p className="text-[13.5px] text-muted-foreground">{isToday ? 'ещё не закрыт' : 'не закрыт'}</p>}
                <div className="flex flex-col gap-3">
                  {story.evening && story.evening.tags.length > 0 && (
                    <Group title="теги">
                      <Chips>
                        {story.evening.tags.map((t) => (
                          <TagChip key={t} tag={t} levels={day.levels} />
                        ))}
                      </Chips>
                    </Group>
                  )}
                  {groups.map((g) => (
                    <Group key={g.title} title={g.title}>
                      <Chips>
                        {g.names.map((name) => (
                          <MarkChip key={name} name={name} hit={g.hit} />
                        ))}
                      </Chips>
                    </Group>
                  ))}
                  {story.evening?.note && (
                    <Group title="заметка">
                      <Note text={story.evening.note} />
                    </Group>
                  )}
                </div>
              </Step>
            </ul>

            {story.guess && (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-warn/30 bg-warn/10 px-3 py-2.5">
                <LightbulbIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
                <p className="text-[13.5px]">
                  {guessText(story.guess, goal)}
                  {story.guess.kind === 'link' && (
                    <>
                      {' '}
                      <span className="font-mono text-muted-foreground">{LEVEL[story.guess.level].dots}</span>
                    </>
                  )}
                </p>
              </div>
            )}

            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((v) => !v)}
              className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-[13px]"
            >
              Все оценки
              <ChevronDownIcon aria-hidden className={cn('size-4 transition-transform', all && 'rotate-180')} />
            </button>
            {all && (
            <div className="flex flex-col gap-3">
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
            {marks.length > 0 && (
              <ul aria-label="Отметки дня" className="flex flex-col gap-1 text-[13.5px]">
                {marks.map(([c, o]) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span>{c.name}</span>
                    <span className={o === 'hit' ? 'text-better' : o === 'miss' ? 'text-worse' : 'text-muted-foreground'}>{outcomeText(c, o, day ? valueOf(c, day.day) : undefined)}</span>
                  </li>
                ))}
              </ul>
            )}
            </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
