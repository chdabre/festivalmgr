<script setup lang="ts">
import { reactive } from 'vue'
import type { Artist, ResourceLink } from '#layers/artists/shared/types'
import type { EvaluatedChecklistItem } from '#layers/artists/app/composables/useArtistChecklistTemplate'

const props = defineProps<{
  items: EvaluatedChecklistItem[]
  artist: Artist
  canEdit: boolean
}>()

const emit = defineEmits<{
  toggle: [payload: { itemId: string; done: boolean }]
  addResource: [payload: { itemId: string; link: { url: string; title?: string }; current: ResourceLink[] }]
  removeResource: [payload: { itemId: string; url: string; current: ResourceLink[] }]
}>()

const drafts = reactive<Record<string, { url: string; title: string }>>({})
function ensureDraft(id: string) {
  if (!drafts[id]) drafts[id] = { url: '', title: '' }
  return drafts[id]
}

function onAdd(itemId: string) {
  const d = drafts[itemId]
  if (!d?.url) return
  const current = props.artist.checklist?.[itemId]?.resources ?? []
  emit('addResource', { itemId, link: { url: d.url, title: d.title || undefined }, current })
  drafts[itemId] = { url: '', title: '' }
}

function onRemove(itemId: string, url: string) {
  const current = props.artist.checklist?.[itemId]?.resources ?? []
  emit('removeResource', { itemId, url, current })
}
</script>

<template>
  <div v-if="items.length === 0" class="text-sm text-muted py-4">
    No checklist items configured for this artist's category.
  </div>
  <div v-else class="space-y-4">
    <div
      v-for="item in items"
      :key="item.id"
      class="border-b border-default pb-3 last:border-b-0 last:pb-0"
    >
      <div class="flex items-start gap-2">
        <UCheckbox
          v-if="!item.requirement"
          :model-value="item.done"
          :disabled="!canEdit"
          @update:model-value="(v) => emit('toggle', { itemId: item.id, done: Boolean(v) })"
        />
        <span
          v-else
          class="inline-flex h-4 w-4 mt-0.5 items-center justify-center rounded-full"
          :class="item.done ? 'bg-success text-inverted' : 'border border-default text-muted'"
          :title="item.done ? 'Auto-satisfied — resource is linked' : 'Add a resource link to satisfy'"
        >
          <span v-if="item.done" class="text-[10px]">✓</span>
        </span>

        <div class="flex-1">
          <div class="flex items-baseline gap-2">
            <span class="font-medium">{{ item.label }}</span>
            <span v-if="item.description" class="text-xs text-muted">{{ item.description }}</span>
          </div>

          <div v-if="item.requirement?.type === 'resource'" class="mt-2 space-y-1">
            <ArtistResourceLinkRow
              v-for="r in (artist.checklist?.[item.id]?.resources ?? [])"
              :key="r.url"
              :resource="r"
              :can-remove="canEdit"
              @remove="onRemove(item.id, $event)"
            />
            <div v-if="canEdit" class="flex gap-2 items-end mt-2">
              <UFormField label="URL" class="flex-1">
                <UInput v-model="ensureDraft(item.id).url" placeholder="https://drive.google.com/..." />
              </UFormField>
              <UFormField label="Title (optional)">
                <UInput v-model="ensureDraft(item.id).title" />
              </UFormField>
              <UButton size="xs" :disabled="!ensureDraft(item.id).url" @click="onAdd(item.id)">Add</UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
