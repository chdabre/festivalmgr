import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const addDocMock      = vi.fn(async () => ({ id: 'newid' }))
const setDocMock      = vi.fn(async () => undefined)
const updateDocMock   = vi.fn(async () => undefined)
const collectionMock  = vi.fn((..._a: unknown[]) => ({ kind: 'collection' }))
const docMock         = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))
const tsMock          = vi.fn(() => ({ kind: 'ts', _isMock: true }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...a: unknown[]) => addDocMock(...a as [unknown, unknown]),
  setDoc: (...a: unknown[]) => setDocMock(...a as [unknown, unknown]),
  updateDoc: (...a: unknown[]) => updateDocMock(...a as [unknown, unknown]),
  collection: (...a: unknown[]) => collectionMock(...a),
  doc: (...a: unknown[]) => docMock(...a),
  serverTimestamp: () => tsMock(),
  Timestamp: { now: () => ({ kind: 'ts', _isMock: true }) },
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCurrentUser: () => ref({ uid: 'u1' }),
}))

import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'

describe('useArtistMutations', () => {
  beforeEach(() => {
    addDocMock.mockClear(); setDocMock.mockClear(); updateDocMock.mockClear()
    collectionMock.mockClear(); docMock.mockClear()
  })

  it('createArtist writes a doc with createdBy/updatedBy = current user', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.createArtist({ name: 'NewAct', category: 'Musikact' })
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      name: 'NewAct',
      category: 'Musikact',
      status: 'planned',
      createdBy: 'u1',
      updatedBy: 'u1',
      deletedAt: null,
    })
    expect(payload.checklist).toEqual({})
  })

  it('updateArtist sets updatedAt + updatedBy and writes activity log entries for changed fields', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.updateArtist('a1', { fee: { amount: 500, currency: 'CHF' } }, { fee: { amount: 400, currency: 'CHF' } })
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect(addDocMock).toHaveBeenCalledTimes(1)  // activity log entry
    const activityArgs = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityArgs).toMatchObject({ uid: 'u1', field: 'fee', before: { amount: 400, currency: 'CHF' }, after: { amount: 500, currency: 'CHF' } })
  })

  it('softDeleteArtist sets deletedAt, not removes', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.softDeleteArtist('a1')
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.deletedAt).toBeTruthy()
    expect(payload.updatedBy).toBe('u1')
  })

  it('transitionStatus updates status + statusChangedAt and logs activity', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.transitionStatus('a1', 'inquired', 'planned')
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({ status: 'inquired', updatedBy: 'u1' })
    expect(payload.statusChangedAt).toBeTruthy()
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const activityArgs = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityArgs).toMatchObject({ field: 'status', before: 'planned', after: 'inquired' })
  })
})
