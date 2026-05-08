<!-- layers/core/app/components/LocationListItem.vue -->
<script setup lang="ts">
import type { Location } from '#layers/core/shared/types'
const props = defineProps<{
  location: Location & { id: string }
  canEdit: boolean
}>()
const emit = defineEmits<{ remove: [id: string] }>()
</script>

<template>
  <div class="flex items-center gap-3 py-2 border-b border-default last:border-0">
    <span class="font-mono text-xs w-6 text-muted">{{ props.location.order }}</span>
    <div class="flex-1">
      <div class="font-medium">{{ props.location.name }}</div>
      <div v-if="props.location.capacity" class="text-xs text-muted">Capacity: {{ props.location.capacity }}</div>
    </div>
    <UButton v-if="props.canEdit" size="xs" variant="ghost" color="error" @click="emit('remove', props.location.id)">Remove</UButton>
  </div>
</template>
