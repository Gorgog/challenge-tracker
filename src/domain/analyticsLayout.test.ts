import { describe, expect, it } from 'vitest'
import { DEFAULT_ANALYTICS_LAYOUT, moveBlock, normalizeLayout, toggleOpen, type AnalyticsBlock } from './analyticsLayout'

describe('раскладка аналитики — порядок блоков и открытые (решение Georgy 25.09)', () => {
  it('по умолчанию: «Что попробовать», «Что изменилось», «Случаи», «Объясняет плохие дни»; всё свёрнуто', () => {
    expect(DEFAULT_ANALYTICS_LAYOUT).toEqual({ order: ['links', 'changes', 'cases', 'explains'], open: [] })
  })

  it('normalizeLayout: чужое и повторы выкидывает, забытые блоки — в хвост в обычном порядке', () => {
    const raw = { order: ['cases', 'x', 'cases', 'links'], open: ['links', 'y', 'links'] } as unknown as { order: AnalyticsBlock[]; open: AnalyticsBlock[] }
    expect(normalizeLayout(raw)).toEqual({ order: ['cases', 'links', 'changes', 'explains'], open: ['links'] })
  })

  it('normalizeLayout: пусто или мусор — раскладка по умолчанию', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_ANALYTICS_LAYOUT)
    expect(normalizeLayout({ order: 'links', open: 5 } as never)).toEqual(DEFAULT_ANALYTICS_LAYOUT)
  })

  it('moveBlock: блок встаёт на место того, на который бросили — вверх и вниз', () => {
    expect(moveBlock(['links', 'changes', 'cases', 'explains'], 'explains', 'links')).toEqual(['explains', 'links', 'changes', 'cases'])
    expect(moveBlock(['links', 'changes', 'cases', 'explains'], 'links', 'explains')).toEqual(['changes', 'cases', 'explains', 'links'])
  })

  it('moveBlock: бросили на себя или на неизвестное — порядок прежний', () => {
    const order: AnalyticsBlock[] = ['links', 'changes', 'cases', 'explains']
    expect(moveBlock(order, 'cases', 'cases')).toEqual(order)
    expect(moveBlock(order, 'cases', 'nope' as AnalyticsBlock)).toEqual(order)
  })

  it('moveBlock: скрытый сейчас блок (нет «Случаев») между ними не теряется и не прыгает', () => {
    // на экране: links, changes, explains; «cases» пуст и не нарисован
    expect(moveBlock(['links', 'changes', 'cases', 'explains'], 'explains', 'changes')).toEqual(['links', 'explains', 'changes', 'cases'])
  })

  it('toggleOpen: открыть и закрыть, без повторов', () => {
    const open = toggleOpen({ order: [...DEFAULT_ANALYTICS_LAYOUT.order], open: [] }, 'changes')
    expect(open.open).toEqual(['changes'])
    expect(toggleOpen(open, 'changes').open).toEqual([])
    expect(toggleOpen(toggleOpen(open, 'links'), 'links').open).toEqual(['changes'])
  })
})
