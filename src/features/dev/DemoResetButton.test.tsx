import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DemoResetButton } from './DemoResetButton'

describe('DemoResetButton', () => {
  it('предлагает две истории и отмечает текущую', async () => {
    const user = userEvent.setup()
    render(<DemoResetButton current="full" onReset={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /сбросить демо/i }))
    expect(screen.getByRole('button', { name: /выход из выгорания/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: /полное демо/i })).toHaveAttribute('aria-current', 'true')
  })

  it('выбор истории сбрасывает демо на неё', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<DemoResetButton current="full" onReset={onReset} />)

    await user.click(screen.getByRole('button', { name: /сбросить демо/i }))
    await user.click(screen.getByRole('button', { name: /выход из выгорания/i }))
    expect(onReset).toHaveBeenCalledWith('burnout')
  })
})
