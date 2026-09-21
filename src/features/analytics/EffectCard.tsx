import type { CSSProperties } from 'react'
import { effectText, type ChallengeEffect } from '@/domain/effects'
import { isPaused } from '@/domain/pauses'
import { plural } from '@/lib/plural'
import { BeforeAfterNote } from './BeforeAfterNote'
import { ConfidenceBadge } from './ConfidenceBadge'
import { WindowsTable } from './WindowsTable'
import { capitalize, daysText, score1 } from './words'

/**
 * Заметка, когда утро в дни «с» и так другое — не слабее «похоже»: утро раньше дел, значит, дело не в
 * челлендже, а в том, какими эти дни были с самого начала.
 */
function morningNote({ challenge, morning }: ChallengeEffect): string | null {
  const same = morning?.same
  if (!same || (same.strength !== 'likely' && same.strength !== 'strong')) return null
  const by = score1(Math.abs(same.delta))
  const quit = challenge.kind === 'quit'
  const days = quit ? 'в дни без срыва' : 'в дни выполнения'
  if (same.delta > 0) {
    const why = quit ? 'в хорошие дни держаться легче' : 'в хорошие дни делаешь чаще'
    return `Утро ${days} и так лучше — на ${by}: похоже, ${why}.`
  }
  return quit ? `Утро ${days} хуже — на ${by}.` : `Утро ${days} хуже — на ${by}: похоже, берёшься за это в плохие дни.`
}

/** Что челлендж делает с днём: вывод словами, оценка дня и утро в двух окнах, шкалы — по раскрытию. */
export function EffectCard({ effect }: { effect: ChallengeEffect }) {
  const { challenge: c, windows, verdict, confidence, partner, days, sickDays, morningBase, morning } = effect
  const { same } = windows.day
  const note = morningNote(effect)

  const counted = `${plural(days, 'учтён', 'учтено', 'учтено')} ${daysText(days)}`
  /* При том же утре окно «в тот же день» считалось по дням с утром — это и сказано. */
  const facts = [
    morningBase
      ? `${counted} · в тот же день — с утром: с — ${same.withDays}, без — ${same.withoutDays}`
      : `${counted}: с — ${same.withDays}, без — ${same.withoutDays}`,
  ]
  if (sickDays > 0) {
    facts.push(`${daysText(sickDays)} ${plural(sickDays, 'не учтён', 'не учтены', 'не учтены')} из-за болезни`)
  }
  if (partner) facts.push(`делается вместе с ${partner.code} — его вклад вычтен`)
  if (effect.twin) facts.push(`почти всегда вместе с ${effect.twin.code} — чей эффект, не сказать`)

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
          <p className="mt-0.5 text-[13px] leading-snug">{capitalize(effectText(verdict, windows.day, 'challenge', morningBase))}</p>
        </div>
        <ConfidenceBadge confidence={confidence} />
      </header>

      {verdict === 'insufficient' ? (
        <BeforeAfterNote effect={effect} />
      ) : (
        <>
          <WindowsTable windows={windows} metrics={['day']} morning={morning} />
          {note && <p className="text-[12px] leading-snug text-muted-foreground">{note}</p>}
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
