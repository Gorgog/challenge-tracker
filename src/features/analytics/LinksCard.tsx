import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { CONTEXT_TAGS, LINK_CLOSED, LINK_MIN, LINK_RECORDED, type Chain, type Link, type Links } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { plural } from '@/lib/plural'
import { chainLead } from './ChainSheet'
import { Fold } from './Fold'
import { earlyNote, factorName, LEVEL, linkLine, linkTitle } from './linkWords'

const BUCKET = { less: 'Меньше', more: 'Больше' } as const
const links = (n: number) => `${n} ${plural(n, 'связь', 'связи', 'связей')}`
const need = (l: Link) => Math.max(0, LINK_MIN - l.withN) + Math.max(0, LINK_MIN - l.withoutN)

/** Пять квадратиков: сколько дней набрано до порога. */
function Bar({ have }: { have: number }) {
  return (
    <span aria-hidden className="font-mono tracking-tight">
      {'▓'.repeat(Math.min(have, LINK_MIN))}
      {'░'.repeat(Math.max(0, LINK_MIN - have))}
    </span>
  )
}

/**
 * Пары, ближе всего к 5 + 5: только те, где видели хоть день «с» и где до порога правда чего-то не хватает.
 * Теги «не в моих силах» сюда не идут: советом они не станут, их место — «Объясняет плохие дни».
 */
function nearest(pairs: Link[]) {
  return pairs
    .filter((l) => l.level === 'early' && l.withN > 0 && need(l) > 0 && !(l.factor.kind === 'tag' && CONTEXT_TAGS.includes(l.factor.tag)))
    .sort((a, b) => need(a) - need(b))
    .slice(0, 3)
}

/** Почему связей пока нет: записей мало, вечера закрыты редко или смотрели, а заметного нет. */
function gateText(data: Links): string | null {
  const g = data.gate
  if (g.recorded < LINK_RECORDED) return `Записано ${g.recorded} ${plural(g.recorded, 'день', 'дня', 'дней')} — чтобы искать связи, нужно хотя бы ${LINK_RECORDED}.`
  if (!g.ok) return `Вечера закрыты в ${Math.round(g.closedShare * 100)} % дней — чтобы сравнивать «с» и «без», нужно хотя бы ${Math.round(LINK_CLOSED * 100)} %.`
  if (data.checked > 0) return `Смотрели ${links(data.checked)} — заметных пока нет.`
  return null
}

function Early({ data }: { data: Links }) {
  const rows = nearest(data.pairs)
  const why = gateText(data)
  return (
    <>
      {why && <p className="text-[14px]">{why}</p>}
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
                <span>{factorName(l)}</span>
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
    </>
  )
}

/**
 * Одна найденная связь: ведро (или «Сон» у плохой ночи — это не совет), точки уверенности, числа, «Подробнее».
 * `onShow` — дни прямо на графике, без карточки связи (у плохой ночи: совета нет, есть доказательство).
 */
function Item({
  l,
  label,
  tone,
  goal,
  onOpen,
  onShow,
  action,
}: {
  l: Link
  label: string
  tone: string
  goal: Goal
  onOpen: (l: Link) => void
  onShow?: (days: string[]) => void
  /** Что попробовать — у «Ночи» и у «Сна» это «Ложусь раньше». */
  action?: ReactNode
}) {
  const [explained, setExplained] = useState(false)
  const level = LEVEL[l.level as keyof typeof LEVEL]
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className={`text-[10.5px] font-semibold tracking-wider uppercase ${tone}`}>{label}</span>
        <span className="flex-1 text-[15px] font-semibold">{linkTitle(l)}</span>
        <button
          type="button"
          aria-label={`Уверенность: ${level.word}`}
          aria-expanded={explained}
          onClick={() => setExplained(!explained)}
          className="font-mono text-[13px] tracking-tight text-primary"
        >
          {level.dots}
        </button>
      </div>
      {explained && <p className="rounded-lg bg-secondary px-2.5 py-1.5 text-[12.5px]">{level.explain}</p>}
      <p className="text-[13.5px] text-muted-foreground">{linkLine(l, goal)}</p>
      <button type="button" aria-label={`Подробнее: ${linkTitle(l)}`} onClick={() => onOpen(l)} className="self-start text-[13.5px] text-primary">
        Подробнее ›
      </button>
      {onShow && (
        <button
          type="button"
          onClick={() => onShow(l.withDays)}
          className="self-start rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-ring"
        >
          Показать эти дни на графике
        </button>
      )}
      {action}
    </li>
  )
}

/**
 * «Попробовать: ложусь раньше» — форма челленджа с черновиком (срез 4б); если такой уже идёт — ссылка на его разбор,
 * а не второй челлендж.
 */
function TryEarlier({ running }: { running: boolean }) {
  const navigate = useNavigate()
  if (running)
    return (
      <RouterLink to="/analytics/challenges" className="self-start text-[13.5px] text-primary">
        «Ложусь раньше» уже идёт ›
      </RouterLink>
    )
  return (
    <button
      type="button"
      onClick={() => void navigate('/challenges', { state: { draft: 'bedtime' } })}
      className="self-start rounded-lg bg-accent px-2.5 py-1.5 text-[13px] font-medium text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      Попробовать: ложусь раньше
    </button>
  )
}

/**
 * «Что попробовать» — до двух связей по одной на ведро, поздний отбой строкой «Ночь» и плохая ночь строкой «Сон»; нет ни одной — «Связи:
 * пока рано» с прогрессом. «Заметных» — ровно то, что видно.
 */
export function LinksCard({
  data,
  goal,
  chain,
  onOpen,
  onOpenChain,
  onShow,
  tryEarlier,
  bedtimeRunning,
}: {
  data: Links
  goal: Goal
  /** Цепочка у верхней карточки; нет — ссылки нет. */
  chain: Chain | null
  onOpen: (l: Link) => void
  onOpenChain: () => void
  onShow: (days: string[]) => void
  /** Плохие ночи чаще после позднего отбоя (связь «поздний отбой → сон» найдена) — у «Сна» есть что попробовать. */
  tryEarlier: boolean
  /** «Ложусь раньше» уже идёт — вместо «Попробовать» ссылка на разбор. */
  bedtimeRunning: boolean
}) {
  /* одно место на экране: при смене цели «пока рано» и «Что попробовать» сменяют друг друга, раскрытость остаётся */
  if (!data.cards.length && !data.night && !data.late) {
    return (
      <Fold label="Связи: пока рано" title="Связи: пока рано" gap="gap-2.5">
        <Early data={data} />
      </Fold>
    )
  }
  return (
    <Fold label="Что попробовать" title="Что попробовать" gap="gap-2.5">
      <ul className="flex flex-col gap-3">
        {data.cards.map((l) => (
          <Item key={factorName(l)} l={l} label={BUCKET[l.bucket!]} tone={l.bucket === 'less' ? 'text-worse' : 'text-better'} goal={goal} onOpen={onOpen} />
        ))}
        {/* по порядку суток: ночь, потом сон и вечер после него */}
        {data.late && (
          <Item l={data.late} label="Ночь" tone="text-muted-foreground" goal={goal} onOpen={onOpen} action={<TryEarlier running={bedtimeRunning} />} />
        )}
        {data.night && (
          <Item
            l={data.night}
            label="Сон"
            tone="text-muted-foreground"
            goal={goal}
            onOpen={onOpen}
            onShow={onShow}
            action={tryEarlier ? <TryEarlier running={bedtimeRunning} /> : undefined}
          />
        )}
      </ul>
      {chain && (
        <button type="button" onClick={onOpenChain} className="flex flex-col items-start gap-0.5 border-t border-border pt-2.5 text-left">
          <span className="text-[14px] text-primary">Что обычно шло следом ›</span>
          <span className="text-[12.5px] text-muted-foreground">{chainLead(chain)}</span>
        </button>
      )}
      <p className="text-[12px] text-muted-foreground">{`Смотрели ${links(data.checked)}, заметных ${data.found}.`}</p>
    </Fold>
  )
}
