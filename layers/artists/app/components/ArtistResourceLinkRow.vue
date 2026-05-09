<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceLink } from '#layers/artists/shared/types'

const props = defineProps<{
  resource: ResourceLink
  canRemove: boolean
}>()

const emit = defineEmits<{
  remove: [url: string]
}>()

const icon = computed(() => {
  if (props.resource.kind === 'folder') return '📁'
  if (props.resource.kind === 'file') return '📄'
  return '🔗'
})

const label = computed(() => props.resource.title || props.resource.url)
</script>

<template>
  <div class="flex items-center gap-2 text-sm py-1">
    <span aria-hidden="true">{{ icon }}</span>
    <a
      :href="resource.url"
      target="_blank"
      rel="noopener noreferrer"
      class="flex-1 truncate hover:underline text-primary-600"
    >
      {{ label }}
    </a>
    <UButton
      v-if="canRemove"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      @click="emit('remove', resource.url)"
    />
  </div>
</template>
