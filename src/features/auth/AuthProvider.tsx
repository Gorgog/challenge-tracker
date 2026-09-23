import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, supabaseConfigured } from '@/data/supabaseClient'

type AuthState = {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const queryClient = useQueryClient()
  /* Чей кэш на экране: сменился пользователь или вышли — кэш запросов чистится, иначе видны чужие данные. */
  const owner = useRef<string | null | undefined>(undefined)
  const follow = useCallback(
    (next: Session | null) => {
      const id = next?.user.id ?? null
      if (owner.current !== undefined && owner.current !== id) queryClient.clear()
      owner.current = id
    },
    [queryClient],
  )

  useEffect(() => {
    if (!supabaseConfigured) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      follow(data.session)
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      follow(next)
      setSession(next)
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [follow])

  const signOut = async () => {
    await supabase.auth.signOut()
    follow(null)
    setSession(null)
  }

  /* Экран — заново для каждого пользователя: очистка кэша не перерисовывает уже показанные данные. */
  return (
    <AuthContext value={{ session, loading, signOut }}>
      <Fragment key={session?.user.id ?? 'гость'}>{children}</Fragment>
    </AuthContext>
  )
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth вызван вне AuthProvider')
  return ctx
}
