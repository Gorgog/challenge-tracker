import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@/domain/types'
import { SettingsPage } from './SettingsPage'

const mocked = vi.hoisted(() => ({ settings: { morningUntil: 15 } as Settings, saveSettings: vi.fn(), reload: vi.fn(), demo: false }))
vi.mock('@/lib/reload', () => ({ reloadPage: mocked.reload }))

vi.mock('@/data/queries', () => ({
  useSettings: () => ({ data: mocked.settings, isPending: false }),
  useSaveSettings: () => ({ mutate: mocked.saveSettings }),
  usingDemo: () => mocked.demo,
}))

const hourPicker = () => screen.getByRole('combobox', { name: 'Утренние вопросы — до' })

beforeEach(() => {
  mocked.settings = { morningUntil: 15 }
  mocked.saveSettings.mockReset()
  mocked.reload.mockReset()
  mocked.demo = false
  localStorage.removeItem('tabel-mode')
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

describe('настройки — демо', () => {
  const toggle = () => screen.getByRole('checkbox', { name: 'Демо: выдуманные истории вместо твоих данных' })

  it('по умолчанию выключено — сайт работает с базой', () => {
    render(<SettingsPage />)
    expect(toggle()).not.toBeChecked()
    expect(screen.getByText(/твои данные в базе не трогаются/i)).toBeInTheDocument()
  })

  it('включение запоминает режим и перезагружает страницу; выключение — обратно в базу', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<SettingsPage />)
    await user.click(toggle())
    expect(localStorage.getItem('tabel-mode')).toBe('demo')
    expect(mocked.reload).toHaveBeenCalledTimes(1)
    unmount()

    mocked.demo = true
    render(<SettingsPage />)
    expect(toggle()).toBeChecked()
    await user.click(toggle())
    expect(localStorage.getItem('tabel-mode')).toBeNull()
    expect(mocked.reload).toHaveBeenCalledTimes(2)
  })
})
