<script setup lang="ts">
import { computed } from 'vue'
import type { ArtistStatus } from '#layers/artists/shared/types'

const props = defineProps<{
  status: ArtistStatus
}>()

const config: Record<ArtistStatus, { color: 'neutral' | 'info' | 'success' | 'error' | 'warning'; label: string }> = {
  planned:   { color: 'neutral', label: 'Planned' },
  inquired:  { color: 'info',    label: 'Inquired' },
  confirmed: { color: 'success', label: 'Confirmed' },
  declined:  { color: 'error',   label: 'Declined' },
  cancelled: { color: 'warning', label: 'Cancelled' },
}

const c = computed(() => config[props.status])
</script>

<template>
  <UBadge :color="c.color" variant="subtle" size="sm">{{ c.label }}</UBadge>
</template>
