import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'

const reload = vi.hoisted(() => vi.fn())
vi.mock('@/lib/reload', () => ({ reloadPage: reload }))
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('@/features/dev/DemoResetButton', () => ({ DemoResetButton: () => <button type="button">Сбросить демо</button> }))

afterEach(() => {
  localStorage.removeItem('tabel-mode')
  reload.mockReset()
})

const layout = () =>
  render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  )

describe('шапка', () => {
  it('шестерёнка рядом с датой и «Выйти» ведёт в настройки', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })
})

describe('режим «Демо»', () => {
  it('в базе — ни плашки, ни «Сбросить демо»', () => {
    layout()
    expect(screen.queryByText(/выдуманные истории/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Сбросить демо' })).not.toBeInTheDocument()
  })

  it('в демо — плашка и «Сбросить демо»; «Выйти из демо» возвращает в базу', async () => {
    localStorage.setItem('tabel-mode', 'demo')
    const user = userEvent.setup()
    layout()
    expect(screen.getByRole('status')).toHaveTextContent(/Демо: выдуманные истории/)
    expect(screen.getByRole('button', { name: 'Сбросить демо' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Выйти из демо' }))
    expect(localStorage.getItem('tabel-mode')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
