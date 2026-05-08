import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const update = vi.fn(async () => undefined)
const docSnap = { exists: true, data: () => ({ userId: 'u-target', status: 'active' }) }
const docRef = { get: vi.fn(async () => docSnap), update }
const setCustomUserClaims = vi.fn(async () => undefined)

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: vi.fn(() => docRef) }),
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ setCustomUserClaims }),
}))

import { revokeMembership } from '../core/revokeMembership'

describe('revokeMembership', () => {
  beforeEach(() => { update.mockClear(); setCustomUserClaims.mockClear() })

  it('rejects non-directors', async () => {
    const wrapped = test.wrap(revokeMembership)
    await expect(wrapped({
      data: { orgId: 'lila', membershipId: 'm1' },
      auth: { uid: 'caller', token: { orgId: 'lila', role: 'pr' } },
    } as never)).rejects.toThrow(/permission-denied/)
  })

  it('marks revoked + clears claims for the affected user', async () => {
    const wrapped = test.wrap(revokeMembership)
    await wrapped({
      data: { orgId: 'lila', membershipId: 'm1' },
      auth: { uid: 'director', token: { orgId: 'lila', role: 'director' } },
    } as never)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
    expect(setCustomUserClaims).toHaveBeenCalledWith('u-target', null)
  })
})
