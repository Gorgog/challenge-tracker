import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Chain, ChainRow } from '@/domain/links'
import { plural } from '@/lib/plural'
import { LEVEL } from './linkWords'
import { num1 } from './words'

const PART = { morning: 'Утро', day: 'День', evening: 'Вечер' } as const
const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`

/** Шаг «как обычно» и шаг по 1–2 дням — серым: это не отличие. */
function cells(r: ChainRow): { value: string; note: string; same: boolean } {
  const quiet = r.side === 'same' || r.side === 'few'
  if (r.kind === 'habit') {
    const note = r.side === 'few' ? 'мало дней' : `обычно ${Math.round(r.usualShare * 10)} из 10`
    return { value: `${r.hits} из ${r.known}`, note, same: quiet }
  }
  if (r.side === 'few') return { value: num1(r.mean), note: 'мало дней', same: true }
  if (r.side === 'same') return { value: num1(r.mean), note: '≈ как обычно', same: true }
  return { value: num1(r.mean), note: `обычно ${num1(r.usual)} · ${r.side === 'worse' ? 'хуже' : 'лучше'} в ${r.count} из ${r.n}`, same: false }
}

/** Заголовок ссылки: после чего и сколько раз. */
export const chainLead = (c: Chain) => `после вечера с «${c.tag}» (${times(c.episodes)})`

/**
 * «Что обычно шло следом» (макет, без строк отбоя и подъёма — их пока не записываем): утро, день, вечер
 * после фактора против обычного. Шаги «как обычно» — серым, не выкидываются. Порядок, а не причины.
 */
export function ChainSheet({
  chain,
  open,
  onShow,
  onClose,
}: {
  chain: Chain | null
  open: boolean
  onShow: (days: string[]) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open && chain !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-4 sm:max-w-md">
        {chain && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight">Что обычно шло следом</DialogTitle>
              <DialogDescription>{chainLead(chain)[0]!.toUpperCase() + chainLead(chain).slice(1)}</DialogDescription>
            </DialogHeader>
            <table className="w-full text-[13.5px]">
              <tbody>
                {chain.rows.map((r, i) => {
                  const c = cells(r)
                  const first = i === 0 || chain.rows[i - 1]!.part !== r.part
                  return (
                    <tr key={`${r.part}:${r.label}`} className={c.same ? 'text-muted-foreground' : ''}>
                      <td className="w-[4.5em] py-1 align-top text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">{first ? PART[r.part] : ''}</td>
                      <td className="py-1 align-top">{r.label}</td>
                      <td className="py-1 text-right align-top font-mono whitespace-nowrap">{c.value}</td>
                      <td className="py-1 pl-2 align-top text-[12px] text-muted-foreground">{c.note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-[13px] text-muted-foreground">
              <p className="text-foreground">Это порядок событий, а не цепочка причин: следующий день мог пойти хуже и сам по себе.</p>
              {chain.compare && (
                <p>{`Для сравнения: после плохой ночи без «${chain.tag}» накануне (${times(chain.compare.n)}) самочувствие и настроение вечером — ${num1(chain.compare.evening)}.`}</p>
              )}
              <p>
                {chain.level === 'notable'
                  ? `Уверенность ${LEVEL.notable.dots} — ${times(chain.episodes)}.`
                  : `Уверенность ${LEVEL.maybe.dots} — ${times(chain.episodes)}, это мало.`}
              </p>
              {chain.noMorning > 0 && <p>{`Ещё ${times(chain.noMorning)} утро не отмечено.`}</p>}
            </div>
            <button
              type="button"
              onClick={() => onShow(chain.days)}
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
