import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({
    artistChecklistTemplate: [
      { id: 'promo-received',      label: 'Promo material received',     order: 10 },
      { id: 'tech-rider-received', label: 'Tech rider received',         order: 20, requirement: { type: 'resource' } },
      { id: 'visa',                label: 'Visa arranged',               order: 30, appliesToCategories: ['Theater'] },
    ],
  })),
}))

import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'

describe('useArtistChecklistTemplate', () => {
  it('returns the template items in order', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    expect(t.items.value!.map((i) => i.id)).toEqual(['promo-received', 'tech-rider-received', 'visa'])
  })

  it('evaluateForArtist filters items whose appliesToCategories excludes the artist', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = { category: 'Musikact', checklist: {} } as never
    const items = t.evaluateForArtist(artist)
    expect(items.map((i) => i.id)).toEqual(['promo-received', 'tech-rider-received'])
  })

  it('evaluateForArtist auto-satisfies a resource-requirement item when ≥1 resource is linked', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = {
      category: 'Musikact',
      checklist: {
        'tech-rider-received': {
          done: false,
          resources: [{ url: 'https://x', addedBy: 'u1', addedAt: 'ts' }],
        },
      },
    } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'tech-rider-received')!
    expect(item.done).toBe(true)
    expect(item.autoSatisfied).toBe(true)
  })

  it('evaluateForArtist leaves a resource-requirement item undone when no resource is linked', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = { category: 'Musikact', checklist: {} } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'tech-rider-received')!
    expect(item.done).toBe(false)
  })

  it('evaluateForArtist respects manual `done` for items without a requirement', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = {
      category: 'Musikact',
      checklist: { 'promo-received': { done: true } },
    } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'promo-received')!
    expect(item.done).toBe(true)
  })
})
