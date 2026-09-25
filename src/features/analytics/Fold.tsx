import { useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Блок разбора, который сворачивается (решение Georgy 25.09): при открытии страницы виден только заголовок,
 * нажатие на него раскрывает и сворачивает содержимое. Свёрнутое не рисуется — ни глазу, ни скринридеру.
 * Раскрытое остаётся раскрытым, пока блок на экране: смена периода или цели его не сворачивает.
 */
export function Fold({ label, title, gap = 'gap-2', children }: { label: string; title: string; gap?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section aria-label={label} className={cn('flex flex-col rounded-2xl border border-border bg-card px-4 py-3.5', gap)}>
      <h2>
        <button
          type="button"
          data-fold
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((o) => !o)}
          className="-my-1.5 flex w-full items-center justify-between gap-2 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase"
        >
          {title}
          <ChevronDownIcon aria-hidden className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
      </h2>
      {open && (
        <div id={id} className={cn('flex flex-col', gap)}>
          {children}
        </div>
      )}
    </section>
  )
}
