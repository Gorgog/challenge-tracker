import { Route, Routes } from 'react-router'
import { supabaseConfigured } from '@/data/supabaseClient'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ChallengesPage } from '@/features/challenges/ChallengesPage'
import { DayPage } from '@/features/day/DayPage'
import { JournalPage } from '@/features/journal/JournalPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { Layout } from './Layout'
import { SetupNeeded } from './SetupNeeded'

export function App() {
  const { session, loading } = useAuth()

  if (!supabaseConfigured) return <SetupNeeded />

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
        Загружаю…
      </div>
    )
  }

  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DayPage />} />
        <Route path="challenges" element={<ChallengesPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<DayPage />} />
      </Route>
    </Routes>
  )
}
