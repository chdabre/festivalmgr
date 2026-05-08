<!-- layers/core/app/components/EventCard.vue -->
<script setup lang="ts">
import type { Event } from '#layers/core/shared/types'
const props = defineProps<{ event: Event & { id: string } }>()
const dateRange = computed(() => {
  const s = props.event.dates.start.toDate()
  const e = props.event.dates.end.toDate()
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`
})
</script>

<template>
  <NuxtLink :to="`/events/${props.event.id}`">
    <UCard class="hover:bg-elevated transition-colors">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-medium">{{ props.event.name }}</div>
          <div class="text-xs text-muted">{{ dateRange }}</div>
        </div>
        <UBadge variant="subtle">{{ props.event.status }}</UBadge>
      </div>
    </UCard>
  </NuxtLink>
</template>
