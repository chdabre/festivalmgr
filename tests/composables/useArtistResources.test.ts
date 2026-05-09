import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const updateDocMock = vi.fn(async () => undefined)
const docMock       = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
  updateDoc: (...a: unknown[]) => updateDocMock(...a as [unknown, unknown]),
  serverTimestamp: () => ({ _ts: true }),
  Timestamp: { now: () => ({ _ts: true }) },
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCurrentUser: () => ref({ uid: 'u1' }),
}))

import { useArtistResources } from '#layers/artists/app/composables/useArtistResources'

describe('useArtistResources', () => {
  beforeEach(() => {
    updateDocMock.mockClear()
  })

  it('addResource appends to checklist[itemId].resources via field-path update', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.addResource('tech-rider-received', { url: 'https://drive.google.com/file/abc' }, [])
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(1)
    expect(newList[0]).toMatchObject({ url: 'https://drive.google.com/file/abc', addedBy: 'u1' })
  })

  it('addResource preserves existing resources and infers folder kind', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.addResource('tech-rider-received', { url: 'https://drive.google.com/drive/folders/X' },
      [{ url: 'old', addedBy: 'u0', addedAt: { _ts: true } as never }])
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(2)
    expect(newList[1]!.kind).toBe('folder')
  })

  it('removeResource splices the matching url out', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.removeResource('tech-rider-received', 'https://drive.google.com/file/abc',
      [
        { url: 'https://drive.google.com/file/abc', addedBy: 'u1', addedAt: { _ts: true } as never },
        { url: 'https://drive.google.com/file/keep', addedBy: 'u1', addedAt: { _ts: true } as never },
      ])
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(1)
    expect(newList[0]!.url).toBe('https://drive.google.com/file/keep')
  })
})
