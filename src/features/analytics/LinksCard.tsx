import { useState } from 'react'
import { LINK_MIN, LINK_RECORDED, type Chain, type Link, type Links } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { plural } from '@/lib/plural'
import { chainLead } from './ChainSheet'
import { earlyNote, factorName, LEVEL, linkLine, linkTitle } from './linkWords'

const BUCKET = { less: 'Меньше', more: 'Больше' } as const
const KICKER = 'text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase'
const CARD = 'flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5'
const links = (n: number) => `${n} ${plural(n, 'связь', 'связи', 'связей')}`

/** Пять квадратиков: сколько дней набрано до порога. */
function Bar({ have }: { have: number }) {
  return (
    <span aria-hidden className="font-mono tracking-tight">
      {'▓'.repeat(Math.min(have, LINK_MIN))}
      {'░'.repeat(Math.max(0, LINK_MIN - have))}
    </span>
  )
}

/** Пары, ближе всего к 5 + 5: сперва те, где видели хоть день «с». Теги «не в моих силах» — тоже, это счётчик. */
function nearest(pairs: Link[]) {
  const need = (l: Link) => Math.max(0, LINK_MIN - l.withN) + Math.max(0, LINK_MIN - l.withoutN)
  return pairs
    .filter((l) => l.level === 'early' && l.withN > 0)
    .sort((a, b) => need(a) - need(b))
    .slice(0, 3)
}

function Early({ data }: { data: Links }) {
  const rows = nearest(data.pairs)
  return (
    <section aria-label="Связи: пока рано" className={CARD}>
      <h2 className={KICKER}>Связи: пока рано</h2>
      {!data.gate.ok && data.gate.recorded < LINK_RECORDED ? (
        <p className="text-[14px]">{`Записано ${data.gate.recorded} ${plural(data.gate.recorded, 'день', 'дня', 'дней')} — чтобы искать связи, нужно хотя бы ${LINK_RECORDED}.`}</p>
      ) : !data.gate.ok ? (
        <p className="text-[14px]">Вечера закрыты меньше чем в 70 % дней — сравнивать «с» и «без» пока нечестно.</p>
      ) : data.checked > 0 ? (
        <p className="text-[14px]">{`Смотрели ${links(data.checked)} — заметных пока нет.`}</p>
      ) : null}
      <p className="text-[14px] text-muted-foreground">Нужно 5 дней «с» и 5 «без» — тогда покажем, что с чем идёт.</p>
      {rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-1">
            {rows.map((l) => (
              <li
                key={factorName(l)}
                role="img"
                aria-label={`${factorName(l)}: с — ${Math.min(l.withN, LINK_MIN)} из ${LINK_MIN}, без — ${l.withoutN >= LINK_MIN ? 'есть' : `${l.withoutN} из ${LINK_MIN}`}`}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 text-[14px]"
              >
                <span>{l.factor.kind === 'tag' ? factorName(l) : 'плохая ночь'}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  с <Bar have={l.withN} /> {Math.min(l.withN, LINK_MIN)}/{LINK_MIN}
                </span>
                <span className="text-[12.5px] text-muted-foreground">без {l.withoutN >= LINK_MIN ? '✓' : `${l.withoutN}/${LINK_MIN}`}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted-foreground">{earlyNote(rows[0]!)}</p>
        </>
      )}
    </section>
  )
}

/** «Что попробовать» — до трёх связей по одной на ведро; нет ни одной — «Связи: пока рано» с прогрессом. */
export function LinksCard({
  data,
  goal,
  chain,
  onOpen,
  onOpenChain,
}: {
  data: Links
  goal: Goal
  /** Цепочка у верхней карточки; нет — ссылки нет. */
  chain: Chain | null
  onOpen: (l: Link) => void
  onOpenChain: () => void
}) {
  const [explained, setExplained] = useState<number | null>(null)
  if (!data.cards.length) return <Early data={data} />
  return (
    <section aria-label="Что попробовать" className={CARD}>
      <h2 className={KICKER}>Что попробовать</h2>
      <ul className="flex flex-col gap-3">
        {data.cards.map((l, i) => {
          const level = LEVEL[l.level as keyof typeof LEVEL]
          return (
            <li key={factorName(l)} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-[10.5px] font-semibold tracking-wider uppercase ${l.bucket === 'less' ? 'text-worse' : 'text-better'}`}>
                  {BUCKET[l.bucket!]}
                </span>
                <span className="flex-1 text-[15px] font-semibold">{linkTitle(l)}</span>
                <button
                  type="button"
                  aria-label={`Уверенность: ${level.word}`}
                  aria-expanded={explained === i}
                  onClick={() => setExplained(explained === i ? null : i)}
                  className="font-mono text-[13px] tracking-tight text-primary"
                >
                  {level.dots}
                </button>
              </div>
              {explained === i && <p className="rounded-lg bg-secondary px-2.5 py-1.5 text-[12.5px]">{level.explain}</p>}
              <p className="text-[13.5px] text-muted-foreground">{linkLine(l, goal)}</p>
              <button type="button" onClick={() => onOpen(l)} className="self-start text-[13.5px] text-primary">
                Подробнее ›
              </button>
            </li>
          )
        })}
      </ul>
      {chain && (
        <button type="button" onClick={onOpenChain} className="flex flex-col items-start gap-0.5 border-t border-border pt-2.5 text-left">
          <span className="text-[14px] text-primary">Что обычно шло следом ›</span>
          <span className="text-[12.5px] text-muted-foreground">{chainLead(chain)}</span>
        </button>
      )}
      <p className="text-[12px] text-muted-foreground">{`Смотрели ${links(data.checked)}, заметных ${data.found}.`}</p>
    </section>
  )
}
