import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/data/supabaseClient'
import { siteUrl } from '@/lib/siteUrl'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      /* с путём сайта: на GitHub Pages это /challenge-tracker/, а не корень домена */
      options: { emailRedirectTo: siteUrl() },
    })
    if (error) {
      setError(error.message)
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Табель</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Личный трекер челленджей. Вход по ссылке на почту — пароль не нужен.
        </p>
      </div>

      {status === 'sent' ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm">
            Отправил ссылку на <span className="font-mono">{email}</span>. Открой письмо на этом же
            устройстве — оно вернёт тебя сюда уже внутрь.
          </p>
          <Button variant="ghost" className="mt-3 px-0" onClick={() => setStatus('idle')}>
            Ввести другой адрес
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Почта</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="ты@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Отправляю…' : 'Прислать ссылку'}
          </Button>
        </form>
      )}
    </main>
  )
}
