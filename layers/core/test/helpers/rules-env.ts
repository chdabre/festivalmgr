/**
 * Test helpers for @firebase/rules-unit-testing.
 *
 * Provides a singleton RulesTestEnvironment seeded from the composed root
 * `firestore.rules` and `storage.rules`, plus convenience helpers for
 * authenticated / unauthenticated contexts and direct fixture seeding.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing'

export type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

export type TestUser = {
  uid: string
  orgId?: string
  role?: Role
  orgs?: Record<string, Role>
  email?: string
}

let envPromise: Promise<RulesTestEnvironment> | null = null

export function getEnv(): Promise<RulesTestEnvironment> {
  if (envPromise) return envPromise
  const root = process.cwd()
  envPromise = initializeTestEnvironment({
    projectId: 'demo-festivalmgr-rules-test',
    firestore: {
      rules: readFileSync(join(root, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(join(root, 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
  return envPromise
}

export function actingAs(env: RulesTestEnvironment, user: TestUser) {
  const { uid, ...claims } = user
  // The second arg to authenticatedContext becomes request.auth.token.*
  return env.authenticatedContext(uid, claims as Record<string, unknown>).firestore()
}

export function actingAsAnon(env: RulesTestEnvironment) {
  return env.unauthenticatedContext().firestore()
}

export async function seedAsAdmin(
  env: RulesTestEnvironment,
  fn: (ctx: RulesTestContext) => Promise<void>,
) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx))
}
