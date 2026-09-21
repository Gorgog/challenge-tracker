import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'

vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('@/features/dev/DemoResetButton', () => ({ DemoResetButton: () => null }))

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
