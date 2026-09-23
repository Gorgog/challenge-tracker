import { SettingsIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { DemoResetButton } from '@/features/dev/DemoResetButton'
import { setDemo } from '@/data/mode'
import { usingDemo } from '@/data/queries'
import { reloadPage } from '@/lib/reload'
import { formatHuman, todayKey, parseDay, DOW, isoDow } from '@/domain/date'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { to: '/', label: 'День', end: true },
  { to: '/challenges', label: 'Челленджи', end: false },
  { to: '/analytics', label: 'Аналитика', end: false },
  { to: '/journal', label: 'Дневник', end: false },
]

export function Layout() {
  const { signOut } = useAuth()
  const today = parseDay(todayKey())
  const demo = usingDemo()

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="mr-2 flex items-baseline gap-2">
          <b className="text-[15px] font-bold tracking-tight">Табель</b>
        </span>

        <nav className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-foreground font-semibold text-background'
                    : 'text-secondary-foreground hover:bg-muted',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {DOW[isoDow(today)]}, {formatHuman(today)}
          </span>
          <NavLink
            to="/settings"
            aria-label="Настройки"
            title="Настройки"
            className={({ isActive }) =>
              cn(
                'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted text-foreground',
              )
            }
          >
            <SettingsIcon aria-hidden="true" className="size-4" />
          </NavLink>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Выйти
          </Button>
        </div>
      </header>

      {demo && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-chart-3/45 bg-chart-3/10 px-3.5 py-2 text-[13px]"
        >
          <span>Демо: выдуманные истории. Твои данные в базе не трогаются.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDemo(false)
              reloadPage()
            }}
          >
            Выйти из демо
          </Button>
        </div>
      )}

      <main className="min-h-0 flex-1 rounded-2xl border border-border bg-card">
        <Outlet />
      </main>

      {demo && <DemoResetButton />}
    </div>
  )
}
