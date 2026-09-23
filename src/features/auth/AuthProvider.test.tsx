import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

type Listener = (event: string, session: { user: { id: string } } | null) => void

const auth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  listener: null as Listener | null,
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/data/supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (cb: Listener) => {
        auth.listener = cb
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signOut: auth.signOut,
    },
  },
}))

function Who() {
  const { session, signOut } = useAuth()
  return (
    <>
      <span data-testid="who">{session?.user.id ?? 'никто'}</span>
      <button type="button" onClick={signOut}>
        Выйти
      </button>
    </>
  )
}

function setup() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Who />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  auth.session = { user: { id: 'A' } }
  auth.listener = null
  auth.signOut.mockClear()
})

describe('вход и кэш данных: чужие данные не остаются на экране', () => {
  it('тот же пользователь (обновление токена) — кэш на месте; другой — кэш очищен', async () => {
    const client = setup()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('A'))
    client.setQueryData(['challenges'], ['данные А'])

    act(() => auth.listener!('TOKEN_REFRESHED', { user: { id: 'A' } }))
    expect(client.getQueryData(['challenges'])).toEqual(['данные А'])

    act(() => auth.listener!('SIGNED_IN', { user: { id: 'B' } }))
    expect(client.getQueryData(['challenges'])).toBeUndefined()
  })

  it('выход очищает кэш', async () => {
    const user = userEvent.setup()
    const client = setup()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('A'))
    client.setQueryData(['dayLogs'], ['оценки А'])

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(auth.signOut).toHaveBeenCalled()
    expect(client.getQueryData(['dayLogs'])).toBeUndefined()
    expect(screen.getByTestId('who')).toHaveTextContent('никто')
  })

  it('выход из другой вкладки (событие без сессии) тоже очищает кэш', async () => {
    const client = setup()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('A'))
    client.setQueryData(['entries'], { a: {} })
    act(() => auth.listener!('SIGNED_OUT', null))
    expect(client.getQueryData(['entries'])).toBeUndefined()
  })
})
