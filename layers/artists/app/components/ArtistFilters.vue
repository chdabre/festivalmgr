<!-- layers/artists/app/components/ArtistFilters.vue -->
<script setup lang="ts">
import type { ArtistListFilter } from '#layers/artists/app/composables/useArtistList'
import type { ArtistStatus } from '#layers/artists/shared/types'

const props = defineProps<{
  modelValue: ArtistListFilter
  availableCategories: string[]
  search?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [filter: ArtistListFilter]
  'update:search': [value: string]
}>()

const STATUSES: { value: ArtistStatus; label: string }[] = [
  { value: 'planned',   label: 'Planned' },
  { value: 'inquired',  label: 'Inquired' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined',  label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const cur = list ?? []
  return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
}

function onStatusClick(s: ArtistStatus) {
  emit('update:modelValue', { ...props.modelValue, status: toggle(props.modelValue.status, s) })
}

function onCategoryClick(c: string) {
  emit('update:modelValue', { ...props.modelValue, category: toggle(props.modelValue.category, c) })
}

function isStatusActive(s: ArtistStatus) {
  return (props.modelValue.status ?? []).includes(s)
}

function isCategoryActive(c: string) {
  return (props.modelValue.category ?? []).includes(c)
}

function onSearchInput(v: string) {
  emit('update:search', v)
}
</script>

<template>
  <div class="flex flex-col gap-3 mb-4">
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-muted">Status:</span>
      <UButton
        v-for="s in STATUSES"
        :key="s.value"
        :color="isStatusActive(s.value) ? 'primary' : 'neutral'"
        :variant="isStatusActive(s.value) ? 'solid' : 'outline'"
        size="xs"
        @click="onStatusClick(s.value)"
      >
        {{ s.label }}
      </UButton>
    </div>

    <div v-if="availableCategories.length > 0" class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-muted">Category:</span>
      <UButton
        v-for="c in availableCategories"
        :key="c"
        :color="isCategoryActive(c) ? 'primary' : 'neutral'"
        :variant="isCategoryActive(c) ? 'solid' : 'outline'"
        size="xs"
        @click="onCategoryClick(c)"
      >
        {{ c }}
      </UButton>
    </div>

    <UInput
      :model-value="search ?? ''"
      placeholder="Search by name or contact email"
      icon="i-lucide-search"
      @update:model-value="onSearchInput"
    />
  </div>
</template>
