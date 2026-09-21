import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@/domain/types'
import { SettingsPage } from './SettingsPage'

const mocked = vi.hoisted(() => ({ settings: { morningUntil: 15 } as Settings, saveSettings: vi.fn() }))

vi.mock('@/data/queries', () => ({
  useSettings: () => ({ data: mocked.settings, isPending: false }),
  useSaveSettings: () => ({ mutate: mocked.saveSettings }),
}))

const hourPicker = () => screen.getByRole('combobox', { name: 'Утренние вопросы — до' })

beforeEach(() => {
  mocked.settings = { morningUntil: 15 }
  mocked.saveSettings.mockReset()
})

describe('настройки — утро', () => {
  it('показывает, до какого часа спрашивается утро: по умолчанию 15:00', () => {
    render(<SettingsPage />)
    expect(hourPicker()).toHaveValue('15')
  })

  it('сохраняет выбранный час', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.selectOptions(hourPicker(), '12')
    expect(mocked.saveSettings).toHaveBeenCalledWith({ morningUntil: 12 })
  })

  it('часы — с 9:00 до 20:00', () => {
    render(<SettingsPage />)
    const hours = screen.getAllByRole('option').map((o) => o.textContent)
    expect(hours[0]).toBe('9:00')
    expect(hours.at(-1)).toBe('20:00')
  })

  it('объясняет, зачем граница', () => {
    render(<SettingsPage />)
    expect(screen.getByText(/днём оценка уже включает сделанное с утра/i)).toBeInTheDocument()
  })
})
