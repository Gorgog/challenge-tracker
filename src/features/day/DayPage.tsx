import { DOW_FULL, formatHuman, isoDow, parseDay, todayKey } from '@/domain/date'

export function DayPage() {
  const today = parseDay(todayKey())

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-7">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Сегодня</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {DOW_FULL[isoDow(today)]}, {formatHuman(today)}
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Челленджей пока нет — база данных подключается на следующем шаге.
        </p>
      </div>
    </div>
  )
}
