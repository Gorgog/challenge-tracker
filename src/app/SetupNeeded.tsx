/** Показывается, когда нет ключей Supabase — вместо белого экрана с ошибкой в консоли. */
export function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Не хватает ключей Supabase</h1>
      <p className="text-sm text-muted-foreground">
        Создай файл <span className="font-mono">.env.local</span> в корне проекта и положи в него
        две строки из настроек проекта Supabase (Project Settings → API):
      </p>
      <pre className="overflow-x-auto rounded-xl border border-border bg-muted p-4 font-mono text-xs">
        {'VITE_SUPABASE_URL=https://<твой-проект>.supabase.co\nVITE_SUPABASE_ANON_KEY=<anon public key>'}
      </pre>
      <p className="text-sm text-muted-foreground">
        После этого перезапусти <span className="font-mono">npm run dev</span> — переменные читаются
        при старте сборщика.
      </p>
    </main>
  )
}
