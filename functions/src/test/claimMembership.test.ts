import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const updateMembership = vi.fn(async () => undefined)
const setCustomUserClaims = vi.fn(async () => undefined)
const userDocRef = {
  set: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  get: vi.fn(async () => ({ exists: false })),
}

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collectionGroup: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: [
              {
                ref: { update: updateMembership, parent: { parent: { id: 'lila' } } },
                data: () => ({ email: 'invitee@example.com', role: 'production', status: 'pending' }),
              },
            ],
          })),
        })),
      })),
    })),
    doc: vi.fn(() => userDocRef),
  }),
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    arrayUnion: (...x: string[]) => ({ arrayUnion: x }),
  },
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ setCustomUserClaims }),
}))

import { claimMembership } from '../core/claimMembership'

describe('claimMembership', () => {
  beforeEach(() => {
    updateMembership.mockClear()
    setCustomUserClaims.mockClear()
    userDocRef.set.mockClear()
  })

  it('activates pending memberships for caller email and sets claims', async () => {
    const wrapped = test.wrap(claimMembership)
    const result = await wrapped({
      data: {},
      auth: { uid: 'u-invitee', token: { email: 'invitee@example.com' } },
    } as never)
    expect(result.activatedOrgIds).toEqual(['lila'])
    expect(updateMembership).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-invitee',
      status: 'active',
    }))
    expect(setCustomUserClaims).toHaveBeenCalledWith('u-invitee', expect.objectContaining({
      orgId: 'lila',
      role: 'production',
    }))
    expect(userDocRef.set).toHaveBeenCalledWith(expect.objectContaining({
      email: 'invitee@example.com',
      orgIds: ['lila'],
    }))
  })
})
