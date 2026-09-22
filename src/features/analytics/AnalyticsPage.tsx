/**
 * Аналитика снята 23.09 и строится заново (решение Georgy): прежняя модель связей хвалила привычку,
 * которую пропускаешь в дни выпивки, за трезвые дни. Данные продолжают копиться.
 */
export function AnalyticsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Аналитика строится заново.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Утро, вечер, теги и отметки челленджей продолжают записываться — новые выводы будут считаться по ним.
        </p>
      </div>
    </div>
  )
}
