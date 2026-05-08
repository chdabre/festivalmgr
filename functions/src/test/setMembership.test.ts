import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const set = vi.fn(async () => undefined)
const docRef = { id: 'mem123', set }
const collectionRef = { doc: vi.fn(() => docRef) }

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => collectionRef),
  }),
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}))

import { setMembership } from '../core/setMembership'

describe('setMembership', () => {
  beforeEach(() => { set.mockClear(); collectionRef.doc.mockClear() })

  it('rejects non-directors', async () => {
    const wrapped = test.wrap(setMembership)
    await expect(wrapped({
      data: { orgId: 'lila', email: 'a@b.c', role: 'booker' },
      auth: { uid: 'caller', token: { orgId: 'lila', role: 'booker' } },
    } as never)).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('writes a pending membership doc when caller is director', async () => {
    const wrapped = test.wrap(setMembership)
    const result = await wrapped({
      data: { orgId: 'lila', email: 'newbie@example.com', role: 'production' },
      auth: { uid: 'director', token: { orgId: 'lila', role: 'director' } },
    } as never)
    expect(result).toEqual({ membershipId: 'mem123' })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      email: 'newbie@example.com',
      role: 'production',
      status: 'pending',
      invitedBy: 'director',
    }))
  })
})
