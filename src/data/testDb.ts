import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/*
 * Тесты на живой базе (`npm run test:db`). Адрес и ключ — из `.env.local`, два тестовых пользователя с
 * паролем — из `.env.test.local` (заводятся в Supabase → Authentication → Add user; оба файла в git не
 * попадают):
 *   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
 * В обычном `npm test` и без файлов эти тесты пропускаются.
 */

type Proc = { env: Record<string, string | undefined>; loadEnvFile?: (path: string) => void }
const proc = (globalThis as unknown as { process?: Proc }).process

for (const file of ['.env.local', '.env.test.local']) {
  try {
    proc?.loadEnvFile?.(file)
  } catch {
    /* файла нет — тесты пропустятся */
  }
}

const env = proc?.env ?? {}
const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
const users = {
  a: { email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD },
  b: { email: env.TEST_USER_B_EMAIL, password: env.TEST_USER_B_PASSWORD },
}

/** Запущено через `npm run test:db` и всё для входа есть. */
export const dbTestsOn =
  env.npm_lifecycle_event === 'test:db' &&
  Boolean(url && anonKey && users.a.email && users.a.password && users.b.email && users.b.password)

/** Сетевые тесты — с запасом по времени. */
export const DB_TIMEOUT = 30_000

export type Signed = { client: SupabaseClient; uid: string }

export async function signIn(who: 'a' | 'b'): Promise<Signed> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: users[who].email!, password: users[who].password! })
  if (error) throw error
  return { client, uid: data.user.id }
}

/** Гость — без входа. */
export const guest = () => createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })

/** Все таблицы пользователя: отметки раньше челленджей. */
export const TABLES = ['entries', 'challenges', 'tags', 'day_logs', 'day_starts', 'user_settings'] as const

/** Стереть данные тестового пользователя — перед каждым тестом. */
export async function wipe({ client, uid }: Signed) {
  for (const table of TABLES) {
    const { error } = await client.from(table).delete().eq('user_id', uid)
    if (error) throw error
  }
}
