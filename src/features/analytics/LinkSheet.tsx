import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Link } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { plural } from '@/lib/plural'
import { factorName, lateText, LEVEL, linkBasis, otherwiseText, sheetTitle } from './linkWords'
import { num1 } from './words'

/** Полоска на шкале 0–10 с подписью и числом. */
function Bar({ label, value, tone }: { label: string; value: number; tone: 'muted' | 'worse' | 'better' }) {
  const fill = tone === 'muted' ? 'var(--muted-foreground)' : tone === 'worse' ? 'var(--worse)' : 'var(--better)'
  return (
    <div className="grid grid-cols-[minmax(0,9.5em)_1fr_auto] items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2.5 rounded-full bg-secondary">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%`, background: fill }} />
      </span>
      <span className="font-mono">{num1(value)}</span>
    </div>
  )
}

/**
 * Карточка связи (макет: «Выпивка и сон»): заголовок со временем, два числа на одной шкале, каждый случай
 * кружком, на чём держится, «а может быть иначе» и дни на графике. Причин не утверждает.
 */
export function LinkSheet({
  link,
  open,
  goal,
  onShow,
  onClose,
}: {
  /** Последняя открытая связь: остаётся и пока окно закрывается, иначе в анимации мелькает пустая рамка. */
  link: Link | null
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
      <DialogContent className="gap-4 sm:max-w-md">
        {link && level && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg leading-snug font-bold tracking-tight">{sheetTitle(link, goal)}</DialogTitle>
              <DialogDescription>Два числа — по твоим записям за последние 8 недель.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
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
