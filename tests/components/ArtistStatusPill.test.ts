import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistStatusPill from '#layers/artists/app/components/ArtistStatusPill.vue'

describe('ArtistStatusPill', () => {
  const cases: Array<[string, string, string]> = [
    ['planned',   'neutral',  'Planned'],
    ['inquired',  'info',     'Inquired'],
    ['confirmed', 'success',  'Confirmed'],
    ['declined',  'error',    'Declined'],
    ['cancelled', 'warning',  'Cancelled'],
  ]

  // Stub <UBadge> so we can assert color + label without a full Nuxt UI mount.
  const stubs = {
    UBadge: {
      props: ['color'],
      template: '<span :data-color="color"><slot /></span>',
    },
  }

  for (const [status, color, label] of cases) {
    it(`renders ${status} with color ${color} and label "${label}"`, () => {
      const w = mount(ArtistStatusPill, { props: { status }, global: { stubs } })
      expect(w.find('span').attributes('data-color')).toBe(color)
      expect(w.text()).toBe(label)
    })
  }
})
