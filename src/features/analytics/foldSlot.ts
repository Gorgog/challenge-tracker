import { createContext, type CSSProperties, type ReactNode } from 'react'

/** Место блока на странице: открыт ли (из раскладки в аккаунте), ручка и привязка для перетаскивания. */
export type FoldSlot = {
  open: boolean
  onToggle: () => void
  grip: ReactNode
  setNodeRef: (node: HTMLElement | null) => void
  style: CSSProperties
  dragging: boolean
}

export const FoldSlotContext = createContext<FoldSlot | null>(null)
