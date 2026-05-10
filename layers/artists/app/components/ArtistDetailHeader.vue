<script setup lang="ts">
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  artist: Artist
  canEditName: boolean
  canTransition: boolean
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'transition': [payload: { from: ArtistStatus; to: ArtistStatus }]
}>()

const responsible = useUserById(props.artist.responsibleUserId)

const STATUSES: { value: ArtistStatus; label: string }[] = [
  { value: 'planned',   label: 'Planned' },
  { value: 'inquired',  label: 'Inquired' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined',  label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

function onTransition(to: ArtistStatus) {
  if (to === props.artist.status) return
  emit('transition', { from: props.artist.status, to })
}
</script>

<template>
  <div class="flex flex-col gap-4 mb-6">
    <div class="flex items-baseline gap-3 flex-wrap">
      <UInput
        v-if="canEditName"
        :model-value="artist.name"
        size="xl"
        variant="ghost"
        class="text-2xl font-semibold flex-1 min-w-[12rem]"
        @update:model-value="(v) => emit('update:name', v as string)"
      />
      <h1 v-else class="text-2xl font-semibold">{{ artist.name }}</h1>

      <UBadge v-if="artist.category" color="neutral" variant="subtle" size="sm">
        {{ artist.category }}
      </UBadge>

      <ArtistStatusPill :status="artist.status" />

      <span class="text-sm text-muted">
        ·
        <span v-if="responsible">{{ responsible.displayName }}</span>
        <span v-else-if="artist.responsibleUserId" class="opacity-50">{{ artist.responsibleUserId.slice(0, 6) }}…</span>
        <span v-else class="opacity-50">—</span>
      </span>
    </div>

    <div v-if="canTransition" class="flex flex-wrap gap-2">
      <span class="text-sm text-muted self-center">Move to:</span>
      <UButton
        v-for="s in STATUSES"
        :key="s.value"
        :disabled="s.value === artist.status"
        :color="s.value === artist.status ? 'neutral' : 'primary'"
        :variant="s.value === artist.status ? 'soft' : 'outline'"
        size="xs"
        @click="onTransition(s.value)"
      >
        {{ s.label }}
      </UButton>
    </div>
  </div>
</template>
