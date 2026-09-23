import { createDemoRepo } from './demoRepo'
import { repoContract } from './repoContract'

/* Пустое демо в памяти: договор проверяет хранилище, а не сид. */
repoContract('демо', async () => createDemoRepo({ scenario: 'empty', storage: null }))
