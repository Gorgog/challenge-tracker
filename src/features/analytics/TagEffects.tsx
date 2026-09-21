import { ChevronDownIcon } from 'lucide-react'
import { effectText, METRICS, type TagEffect } from '@/domain/effects'
import { MIN_EARLY } from '@/domain/stats'
import { plural } from '@/lib/plural'
import { ConfidenceBadge } from './ConfidenceBadge'
import { WindowsTable } from './WindowsTable'
import { capitalize, daysText } from './words'

/** Теги дня против оценок: вывод словами, цифры по окнам и шкалам — по раскрытию. */
export function TagEffects({ tags }: { tags: TagEffect[] }) {
  if (!tags.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Тегов пока мало: вывод по тегу появляется, когда он стоит хотя бы в {MIN_EARLY}{' '}
          {plural(MIN_EARLY, 'дне', 'днях', 'днях')}.
        </p>
      </div>
    )
  }

  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {tags.map((t) => (
        <li key={t.tag}>
          <details className="group rounded-xl border border-border bg-card px-4 py-3">
            <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[14px] font-medium">{t.tag}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{daysText(t.tagDays)}</span>
              </span>
              <span>
                <ConfidenceBadge confidence={t.confidence} />
              </span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              />
              <span className="col-span-3 text-[13px] leading-snug">
                {capitalize(effectText(t.verdict, t.windows.day, 'tag'))}
              </span>
            </summary>
            <div className="mt-3">
              <WindowsTable windows={t.windows} metrics={METRICS} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}
