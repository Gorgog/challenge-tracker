import { useContext, useId, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FoldSlotContext } from './foldSlot'

/**
 * Блок разбора, который сворачивается (решение Georgy 25.09): по умолчанию виден только заголовок, нажатие на него
 * раскрывает и сворачивает содержимое. Свёрнутое не рисуется — ни глазу, ни скринридеру. На странице блок стоит в
 * месте (`FoldSlotContext`), которое помнит открытость в аккаунте и даёт ручку для перетаскивания; без места —
 * помнит сам, пока на экране.
 */
export function Fold({ label, title, gap = 'gap-2', children }: { label: string; title: string; gap?: string; children: ReactNode }) {
  const slot = useContext(FoldSlotContext)
  const [own, setOwn] = useState(false)
  const id = useId()
  const open = slot ? slot.open : own
  const toggle = slot ? slot.onToggle : () => setOwn((o) => !o)
  return (
    <section
      ref={slot?.setNodeRef}
      style={slot?.style}
      aria-label={label}
      className={cn(
        'relative flex flex-col rounded-2xl border border-border bg-card px-4 py-3.5',
        gap,
        slot?.dragging && 'z-10 shadow-lg ring-1 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-1.5">
        {slot?.grip}
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            data-fold
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={toggle}
            className="-my-1.5 flex w-full items-center justify-between gap-2 py-1.5 text-left text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {title}
            <ChevronDownIcon aria-hidden className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
          </button>
        </h2>
      </div>
      {open && (
        <div id={id} className={cn('flex flex-col', gap)}>
          {children}
        </div>
      )}
    </section>
  )
}
