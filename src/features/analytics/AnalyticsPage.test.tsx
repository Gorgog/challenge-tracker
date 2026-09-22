import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnalyticsPage } from './AnalyticsPage'

describe('AnalyticsPage — аналитика строится заново', () => {
  it('показывает заголовок и заглушку', () => {
    render(<AnalyticsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Аналитика' })).toBeInTheDocument()
    expect(screen.getByText(/аналитика строится заново/i)).toBeInTheDocument()
  })

  it('говорит, что данные продолжают копиться', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText(/утро, вечер, теги и отметки челленджей продолжают записываться/i)).toBeInTheDocument()
  })

  it('старых выводов нет', () => {
    render(<AnalyticsPage />)
    expect(screen.queryByText('Что помогает')).not.toBeInTheDocument()
    expect(screen.queryByText('Теги дня')).not.toBeInTheDocument()
    expect(screen.queryByText('Как идут дни')).not.toBeInTheDocument()
  })
})
