import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistResourceLinkRow from '#layers/artists/app/components/ArtistResourceLinkRow.vue'

const stubs = {
  UButton: {
    props: ['icon', 'color', 'variant'],
    template: '<button v-bind="$attrs"><slot /></button>',
    inheritAttrs: false,
  },
}

const fakeTimestamp = { _ts: true } as never

describe('ArtistResourceLinkRow', () => {
  it('renders the title when present', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', title: 'Tech rider', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    expect(w.text()).toContain('Tech rider')
  })

  it('falls back to the URL when no title', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://drive.google.com/file/abc', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    expect(w.text()).toContain('https://drive.google.com/file/abc')
  })

  it('emits remove with the URL when remove button is clicked', async () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    await w.find('button').trigger('click')
    expect(w.emitted('remove')).toBeTruthy()
    expect(w.emitted('remove')!.at(-1)![0]).toBe('https://x')
  })

  it('hides remove button when canRemove is false', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: false,
      },
      global: { stubs },
    })
    expect(w.find('button').exists()).toBe(false)
  })

  it('renders different icons for file vs folder vs unknown', () => {
    const file = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(file.text()).toContain('📄')

    const folder = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', kind: 'folder', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(folder.text()).toContain('📁')

    const other = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(other.text()).toContain('🔗')
  })
})
