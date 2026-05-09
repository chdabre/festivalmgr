import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistFilters from '#layers/artists/app/components/ArtistFilters.vue'

const stubs = {
  // Render UButton as <button> so we can click and read text.
  UButton: {
    props: ['color', 'variant'],
    template: '<button :data-color="color" :data-variant="variant" v-bind="$attrs"><slot /></button>',
    inheritAttrs: false,
  },
  UInput: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`,
  },
}

describe('ArtistFilters', () => {
  it('toggling a status chip emits update:modelValue with the status added', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { status: [] }, availableCategories: [] },
      global: { stubs },
    })
    const plannedBtn = w.findAll('button').find((b) => b.text() === 'Planned')!
    await plannedBtn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeTruthy()
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { status: string[] }).status).toEqual(['planned'])
  })

  it('toggling an already-selected status chip removes it', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { status: ['planned', 'inquired'] }, availableCategories: [] },
      global: { stubs },
    })
    const plannedBtn = w.findAll('button').find((b) => b.text() === 'Planned')!
    await plannedBtn.trigger('click')
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { status: string[] }).status).toEqual(['inquired'])
  })

  it('renders one button per available category and toggles selection', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { category: [] }, availableCategories: ['Musikact', 'Theater'] },
      global: { stubs },
    })
    const theaterBtn = w.findAll('button').find((b) => b.text() === 'Theater')!
    await theaterBtn.trigger('click')
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { category: string[] }).category).toEqual(['Theater'])
  })

  it('search input emits update:search', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: {}, availableCategories: [], search: '' },
      global: { stubs },
    })
    const input = w.find('input')
    await input.setValue('arxx')
    expect(w.emitted('update:search')).toBeTruthy()
    expect(w.emitted('update:search')!.at(-1)![0]).toBe('arxx')
  })
})
