import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'
import { actingAsAnon, getEnv } from './helpers/rules-env'

let env: RulesTestEnvironment

beforeAll(async () => { env = await getEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

describe('rules pipeline smoke test', () => {
  it('default-deny: anon read of an unmapped path is denied', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, 'random/unknown')))
  })
})
