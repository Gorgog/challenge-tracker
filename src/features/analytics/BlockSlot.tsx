import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import type { AnalyticsBlock } from '@/domain/analyticsLayout'
import { FoldSlotContext } from './foldSlot'

/** Анимацию перестроения после броска выключаем, как на экране дня: иначе блоки уезжают с чужих мест (errors.md). */
const noLayoutAnimation = () => false

/**
 * Место блока разбора (решение Georgy 25.09): тянется только за ручку — на телефоне иначе перетаскивание путалось бы
 * с прокруткой и с нажатием на заголовок.
 */
export function BlockSlot({ id, name, open, onToggle, children }: { id: AnalyticsBlock; name: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    animateLayoutChanges: noLayoutAnimation,
  })
  const grip = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Перетащить блок «${name}»`}
      className="-my-1.5 -ml-2 grid w-6 shrink-0 cursor-grab touch-none place-items-center self-stretch rounded text-muted-foreground/50 hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
  return (
    <FoldSlotContext.Provider
      value={{ open, onToggle, grip, setNodeRef, style: { transform: CSS.Translate.toString(transform), transition }, dragging: isDragging }}
    >
      {children}
    </FoldSlotContext.Provider>
  )
}
