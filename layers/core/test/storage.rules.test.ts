import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { getEnv } from './helpers/rules-env'

let env: RulesTestEnvironment

beforeAll(async () => { env = await getEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearStorage() })

describe('storage rules (deny-all stub)', () => {
  it('anon read denied', async () => {
    const ref = env.unauthenticatedContext().storage().ref('any/path/file.bin')
    await assertFails(ref.getDownloadURL())
  })

  it('authenticated director read denied', async () => {
    const ref = env.authenticatedContext('dir', { orgId: 'lila', role: 'director' }).storage().ref('any/path/file.bin')
    await assertFails(ref.getDownloadURL())
  })

  it('authenticated director write denied', async () => {
    const ref = env.authenticatedContext('dir', { orgId: 'lila', role: 'director' }).storage().ref('any/path/file.bin')
    await assertFails(ref.putString('hello'))
  })
})
