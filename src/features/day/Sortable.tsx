import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupId } from './groups'

type GripProps = {
  activatorRef: (node: HTMLElement | null) => void
  listeners: ReturnType<typeof useSortable>['listeners']
  attributes: ReturnType<typeof useSortable>['attributes']
  label: string
  className?: string
}

function Grip({ activatorRef, listeners, attributes, label, className }: GripProps) {
  return (
    <button
      type="button"
      ref={activatorRef}
      aria-label={label}
      {...attributes}
      {...listeners}
      className={cn(
        'grid w-5 cursor-grab touch-none place-items-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing',
        className,
      )}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
}

export type SortableRowProps = {
  id: string
  label: string
  children: ReactNode
}

/**
 * Карточка с ручкой слева. Тянется только за ручку — иначе отметка в один клик
 * превратилась бы в лотерею «нажал или потянул».
 */
export function SortableRow({ id, label, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1',
        isDragging && 'z-10 opacity-60',
      )}
    >
      <Grip
        activatorRef={setActivatorNodeRef}
        listeners={listeners}
        attributes={attributes}
        label={label}
        className="h-9"
      />
      {children}
    </div>
  )
}

export type SortableGroupProps = {
  group: string
  title: string
  children: ReactNode
}

/** Блок целиком: его тоже можно переставить относительно соседнего блока. */
export function SortableGroup({ group, title, children }: SortableGroupProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: groupId(group) })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex flex-col gap-2', isDragging && 'z-10 opacity-60')}
    >
      <div className="flex items-center gap-1">
        <Grip
          activatorRef={setActivatorNodeRef}
          listeners={listeners}
          attributes={attributes}
          label={`Переставить блок «${title}»`}
          className="h-5"
        />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}
