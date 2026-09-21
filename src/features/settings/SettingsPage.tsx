import { useSaveSettings, useSettings } from '@/data/queries'
import { DEFAULT_SETTINGS } from '@/domain/types'

/** Из каких часов выбирается граница утра. */
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i)

/**
 * Настройки. Пока одна — до какого часа «Начать день» спрашивает утро. Выбор часа — обычный
 * select: на телефоне он открывает системный выбор, и его понимает читалка.
 */
export function SettingsPage() {
  const settings = useSettings()
  const save = useSaveSettings()
  const current = settings.data ?? DEFAULT_SETTINGS

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>

      <section aria-labelledby="morning-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 id="morning-title" className="text-[15px] font-semibold">
          Утро
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="morning-until" className="text-[13.5px]">
            Утренние вопросы — до
          </label>
          <select
            id="morning-until"
            value={current.morningUntil}
            onChange={(e) => save.mutate({ ...current, morningUntil: Number(e.target.value) })}
            className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hour}:00
              </option>
            ))}
          </select>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Утро — база дня: сон, самочувствие и настроение до сегодняшних дел. После этого часа
          «Начать день» не спрашивает утро: днём оценка уже включает сделанное с утра и спутала бы
          аналитику.
        </p>
      </section>
    </div>
  )
}
