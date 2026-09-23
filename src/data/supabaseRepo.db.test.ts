// @vitest-environment node
import { beforeAll } from 'vitest'
import { repoContract } from './repoContract'
import { createSupabaseRepo } from './supabaseRepo'
import { DB_TIMEOUT, dbTestsOn, signIn, wipe, type Signed } from './testDb'

/* Тот же договор, что у демо, — на живой базе, от имени тестового пользователя А. */
let a: Signed
beforeAll(async () => {
  if (dbTestsOn) a = await signIn('a')
}, DB_TIMEOUT)

repoContract(
  'Supabase',
  async () => {
    await wipe(a)
    return createSupabaseRepo(a.client)
  },
  { skip: !dbTestsOn, timeout: DB_TIMEOUT },
)
