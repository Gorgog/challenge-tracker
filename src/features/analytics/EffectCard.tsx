import type { CSSProperties } from 'react'
import { effectText, type ChallengeEffect } from '@/domain/effects'
import { isPaused } from '@/domain/pauses'
import { plural } from '@/lib/plural'
import { BeforeAfterNote } from './BeforeAfterNote'
import { ConfidenceBadge } from './ConfidenceBadge'
import { WindowsTable } from './WindowsTable'
import { capitalize, daysText } from './words'

/** Что челлендж делает с днём: вывод словами, оценка дня в двух окнах, шкалы — по раскрытию. */
export function EffectCard({ effect }: { effect: ChallengeEffect }) {
  const { challenge: c, windows, verdict, confidence, partner, days, sickDays } = effect
  const { same } = windows.day

  const facts = [`учтено ${daysText(days)}: с — ${same.withDays}, без — ${same.withoutDays}`]
  if (sickDays > 0) facts.push(`${sickDays} ${plural(sickDays, 'день', 'дня', 'дней')} болезни не учтены`)
  if (partner) facts.push(`делается вместе с ${partner.code} — его вклад вычтен`)

  return (
    <article
      aria-label={c.name}
      style={{ '--c': c.color } as CSSProperties}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--c)] font-mono text-[10px] font-semibold text-white">
          {c.code}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[14px] font-medium">
            <span className="truncate">{c.name}</span>
            {isPaused(c) && (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                на паузе
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-[13px] leading-snug">{capitalize(effectText(verdict, windows.day, 'challenge'))}</p>
        </div>
        <ConfidenceBadge confidence={confidence} />
      </header>

      {verdict === 'insufficient' ? (
        <BeforeAfterNote challenge={c} beforeAfter={effect.beforeAfter} />
      ) : (
        <>
          <WindowsTable windows={windows} metrics={['day']} />
          <details>
            <summary className="w-fit cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
              По шкалам
            </summary>
            <div className="mt-1">
              <WindowsTable windows={windows} metrics={['mood', 'wellbeing', 'productivity']} showHead={false} />
            </div>
          </details>
          <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">{facts.join(' · ')}</p>
        </>
      )}
    </article>
  )
}
