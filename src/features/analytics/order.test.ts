import { describe, expect, it } from 'vitest'
import { cardsOf, tagsOf } from './order'
import { challenge, effect, est, tag } from './testing'

const ids = (list: { challenge: { id: string } }[]) => list.map((e) => e.challenge.id)

describe('cardsOf — какие карточки и в каком порядке', () => {
  it('удалённые на экран не попадают — в расчётах они уже поучаствовали', () => {
    const gone = effect(est('likely', 1), est('strong', 1.5), {
      challenge: challenge({ id: 'gone', deletedAt: '2026-09-15T00:00:00.000Z' }),
    })
    const kept = effect(est('likely', 1), est('strong', 1.5))
    expect(ids(cardsOf([gone, kept]))).toEqual(['step'])
  })

  it('сначала «уверенно», потом «похоже», потом связи с самим днём, в конце — мало данных', () => {
    const sure = effect(est('likely', 1), est('strong', 1.5), { challenge: challenge({ id: 'sure' }) })
    const likely = effect(est('flat', 0.1), est('likely', 1), { challenge: challenge({ id: 'likely' }) })
    const sameDay = effect(est('likely', 1.2), est('flat', 0.1), { challenge: challenge({ id: 'same' }) })
    const none = effect(est('flat', 0.1), est('flat', 0.2), { challenge: challenge({ id: 'none' }) })
    const few = effect(est('few'), est('few'), { challenge: challenge({ id: 'few' }) })

    expect(ids(cardsOf([few, none, sameDay, likely, sure]))).toEqual(['sure', 'likely', 'same', 'none', 'few'])
  })

  it('«возможно» — после «похоже», но выше связей с самим днём', () => {
    const likely = effect(est('flat', 0.1), est('likely', 1), { challenge: challenge({ id: 'likely' }) })
    // у связи с самим днём разница больше: при равном уровне она встала бы выше
    const possible = effect(est('flat', 0.1), est('possible', 0.9), { challenge: challenge({ id: 'possible' }) })
    const sameDay = effect(est('likely', 2.5), est('flat', 0.1), { challenge: challenge({ id: 'same' }) })

    expect(ids(cardsOf([sameDay, possible, likely]))).toEqual(['likely', 'possible', 'same'])
  })

  it('внутри одного уровня сильнее — выше, в какую бы сторону ни было', () => {
    const small = effect(est('flat', 0.1), est('likely', 0.8), { challenge: challenge({ id: 'small' }) })
    const big = effect(est('flat', 0.1), est('likely', -1.9), { challenge: challenge({ id: 'big' }) })
    expect(ids(cardsOf([small, big]))).toEqual(['big', 'small'])
  })
})

describe('tagsOf — порядок тегов', () => {
  it('сначала выводы с уверенностью, потом остальные; при равенстве — частые теги выше', () => {
    const rare = tag('ссора', est('flat', 0.1), est('flat', 0.1), { tagDays: 6 })
    const often = tag('встречи', est('flat', 0.1), est('flat', 0.1), { tagDays: 19 })
    const drink = tag('алкоголь', est('flat', 0.1), est('likely', -1.6), { tagDays: 14 })

    expect(tagsOf([rare, often, drink]).map((t) => t.tag)).toEqual(['алкоголь', 'встречи', 'ссора'])
  })
})

describe('cardsOf — сила полосы', () => {
  it('полоса про «назавтра» и сильна по окну «назавтра», а не по тому же дню', () => {
    const streak = effect(est('flat', 0.1), est('echo', 2), { challenge: challenge({ id: 'streak' }) })
    const sameDay = effect(est('likely', 1), est('flat', 0.1), { challenge: challenge({ id: 'same' }) })
    expect(ids(cardsOf([sameDay, streak]))).toEqual(['streak', 'same'])
  })
})
