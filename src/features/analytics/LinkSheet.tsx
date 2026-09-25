import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Ladder, Link } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { levelLabel, LEVELS } from '@/domain/tags'
import { plural } from '@/lib/plural'
import { factorName, ladderText, lateText, LEVEL, linkBasis, otherwiseText, sheetTitle } from './linkWords'
import { num1 } from './words'

type Tone = 'muted' | 'worse' | 'better'
const FILL: Record<Tone, string> = { muted: 'var(--muted-foreground)', worse: 'var(--worse)', better: 'var(--better)' }

/**
 * Строка шкалы 0–10: подпись, полоска и число. Строки стоят в общей сетке — полоски и числа выровнены по столбцам.
 * Нет числа — пустая дорожка и слово вместо него (`instead`). `strength` — насыщенность заливки: у лесенки
 * ступень выше — ярче (макет 5б).
 */
function Bar({
  label,
  value,
  tone,
  instead = '—',
  strength = 1,
}: {
  label: string
  value: number | null
  tone: Tone
  instead?: string
  strength?: number
}) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2.5 rounded-full bg-secondary">
        {value !== null && (
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%`, background: FILL[tone], opacity: strength }}
          />
        )}
      </span>
      {value === null ? (
        <span className="text-right text-muted-foreground">{instead}</span>
      ) : (
        <span className="text-right font-mono">{num1(value)}</span>
      )}
    </>
  )
}

/**
 * «Сколько» (срез 5б): «не было», каждая ступень со своим средним и «сколько — не указано» — только числом дней, его
 * в средние не берём. Меньше `LADDER_MIN` дней — «мало дней», а не число. Фраза — только когда её подтвердил `ladder`.
 */
function LadderBlock({ ladder, tone }: { ladder: Ladder; tone: Tone }) {
  const k = LEVELS[ladder.tag]!.long.length
  const text = ladderText(ladder)
  return (
    <div role="group" aria-label="Сколько" className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">Сколько</p>
      <div className="grid grid-cols-[minmax(0,11em)_1fr_auto] items-center gap-x-2 gap-y-1.5 text-[13px]">
        {ladder.steps.map((s) =>
          s.level === null ? (
            <Bar key="unknown" label={`сколько — не указано (${s.n})`} value={null} tone="muted" />
          ) : s.level === 0 ? (
            <Bar key="none" label={`не было (${s.n})`} value={s.mean} tone="muted" instead="мало дней" />
          ) : (
            <Bar
              key={s.level}
              label={`${levelLabel(ladder.tag, s.level, 'long')} (${s.n})`}
              value={s.mean}
              tone={tone}
              instead="мало дней"
              strength={0.4 + (0.6 * s.level) / k}
            />
          ),
        )}
      </div>
      {text && <p className="text-[13.5px] font-medium">{text}</p>}
    </div>
  )
}

/**
 * Карточка связи (макет: «Выпивка и сон»): заголовок со временем, два числа на одной шкале, каждый случай
 * кружком, на чём держится, «а может быть иначе» и дни на графике. Причин не утверждает. У тега со ступенями —
 * ещё лесенка «Сколько» (срез 5б).
 */
export function LinkSheet({
  link,
  ladder = null,
  open,
  goal,
  onShow,
  onClose,
}: {
  /** Последняя открытая связь: остаётся и пока окно закрывается, иначе в анимации мелькает пустая рамка. */
  link: Link | null
  /** Лесенка той же связи — только у тега из `LEVELS`; иначе null. */
  ladder?: Ladder | null
  open: boolean
  goal: Goal
  onShow: (days: string[]) => void
  onClose: () => void
}) {
  const level = link && link.level !== 'early' && link.level !== 'none' ? LEVEL[link.level] : null
  const other = link ? otherwiseText(link) : null
  const [without, withF] = !link
    ? ['', '']
    : link.factor.kind === 'badSleep'
      ? ['после обычной ночи', 'после плохой ночи']
      : link.factor.kind === 'lateBed'
        ? [`после отбоя раньше ${lateText(link)}`, `после отбоя с ${lateText(link)}`]
        : [`без ${factorName(link)}`, `после ${factorName(link)}`]
  return (
    <Dialog open={open && link !== null} onOpenChange={(o) => !o && onClose()}>
      {/* с лесенкой шторка выше экрана телефона — прокрутка внутри, как у окна итога (ревью 5б) */}
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-md">
        {link && level && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg leading-snug font-bold tracking-tight">{sheetTitle(link, goal)}</DialogTitle>
              <DialogDescription>Два числа — по твоим записям за последние 8 недель.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-[minmax(0,9.5em)_1fr_auto] items-center gap-x-2 gap-y-1.5 text-[13px]">
              <Bar label={`${without} (${link.withoutN})`} value={link.withoutMean!} tone="muted" />
              <Bar label={`${withF} (${link.withN})`} value={link.withMean!} tone={link.direction === 'worse' ? 'worse' : 'better'} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[13.5px]">{`${link.direction === 'worse' ? 'Хуже' : 'Лучше'} обычного в ${link.sameSide} из ${link.withN} ${plural(link.withN, 'раза', 'раз', 'раз')}`}</p>
              <p aria-hidden className="font-mono text-[15px] tracking-[0.2em] text-muted-foreground">
                {'○'.repeat(link.sameSide)}
                {'·'.repeat(link.withN - link.sameSide)}
              </p>
            </div>
            {ladder && <LadderBlock ladder={ladder} tone={link.direction === 'worse' ? 'worse' : 'better'} />}
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-[13.5px]">
              <p>
                Уверенность <span className="font-mono text-primary">{level.dots}</span> {level.word}
              </p>
              <p className="text-muted-foreground">{linkBasis(link)}</p>
              {other && <p>{other}</p>}
            </div>
            <button
              type="button"
              onClick={() => onShow(link.withDays)}
              className="rounded-lg border border-input bg-card px-3 py-2 text-[14px] focus-visible:outline-2 focus-visible:outline-ring"
            >
              Показать эти дни на графике
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
