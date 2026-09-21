import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TagEffects } from './TagEffects'
import { est, tag } from './testing'

describe('TagEffects', () => {
  const drink = tag('алкоголь', est('flat', 0.1), est('likely', -1.6, [14, 90]), { tagDays: 14 })

  it('тег — с числом дней, словом уверенности и выводом', () => {
    render(<TagEffects tags={[drink]} />)

    expect(screen.getByText('алкоголь')).toBeInTheDocument()
    expect(screen.getByText('14 дней')).toBeInTheDocument()
    expect(screen.getByText('Похоже')).toBeInTheDocument()
    expect(screen.getByText('Следующий день хуже')).toBeInTheDocument()
  })

  it('цифры по окнам и шкалам — по раскрытию', async () => {
    const user = userEvent.setup()
    render(<TagEffects tags={[drink]} />)

    expect(screen.getByRole('row', { name: /оценка дня/i })).not.toBeVisible()
    await user.click(screen.getByText('алкоголь'))
    expect(screen.getByRole('row', { name: /оценка дня/i })).toHaveTextContent('−1,6')
    expect(screen.getByRole('row', { name: /продуктивность/i })).toBeVisible()
  })

  it('без тегов — объясняет, чего не хватает', () => {
    render(<TagEffects tags={[]} />)
    expect(screen.getByText(/тегов пока мало/i)).toBeInTheDocument()
  })
})

describe('TagEffects — вид строки', () => {
  it('строка тега показывает, что раскрывается', () => {
    render(<TagEffects tags={[tag('встречи', est('flat', 0.1), est('flat', 0.1))]} />)
    expect(screen.getByText('встречи').closest('summary')!.querySelector('svg')).not.toBeNull()
  })
})
