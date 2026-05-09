<!-- layers/artists/app/components/ArtistTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { Artist } from '#layers/artists/shared/types'
import type { EvaluatedChecklistItem } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import type { Location } from '#layers/core/shared/types'

const props = defineProps<{
  artists: (Artist & { id: string })[]
  evaluator: (artist: Artist) => EvaluatedChecklistItem[]
  orgId: string
  eventId: string
  locations: (Location & { id: string })[]
}>()

const locationsById = computed(() => {
  const map: Record<string, string> = {}
  for (const l of props.locations) map[l.id] = l.name
  return map
})

function progress(a: Artist) {
  const items = props.evaluator(a)
  const done = items.filter((i) => i.done).length
  return `${done}/${items.length}`
}

function feeLabel(a: Artist) {
  if (!a.fee) return '—'
  return `${a.fee.amount.toLocaleString()} ${a.fee.currency}`
}

function dayLabel(iso?: string) {
  if (!iso) return '—'
  // ISO yyyy-mm-dd → locale-formatted short date
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div v-if="artists.length === 0" class="py-8 text-center text-muted text-sm">
    No artists yet. Click "Add artist" to create the first one.
  </div>
  <table v-else class="w-full text-sm">
    <thead class="text-left text-muted">
      <tr class="border-b border-default">
        <th class="py-2 font-medium">Name</th>
        <th class="py-2 font-medium">Category</th>
        <th class="py-2 font-medium">Status</th>
        <th class="py-2 font-medium">Responsible</th>
        <th class="py-2 font-medium">Day</th>
        <th class="py-2 font-medium">Location</th>
        <th class="py-2 font-medium text-right">Fee</th>
        <th class="py-2 font-medium text-right">Progress</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="a in artists"
        :key="a.id"
        class="border-b border-default hover:bg-elevated cursor-pointer"
        @click="$router.push(`/events/${eventId}/artists/${a.id}`)"
      >
        <td class="py-2">{{ a.name }}</td>
        <td class="py-2">{{ a.category }}</td>
        <td class="py-2"><ArtistStatusPill :status="a.status" /></td>
        <td class="py-2">
          <ArtistTableResponsibleCell :uid="a.responsibleUserId" />
        </td>
        <td class="py-2">{{ dayLabel(a.intendedDay) }}</td>
        <td class="py-2">{{ a.intendedLocationId ? (locationsById[a.intendedLocationId] ?? '—') : '—' }}</td>
        <td class="py-2 text-right">{{ feeLabel(a) }}</td>
        <td class="py-2 text-right tabular-nums">{{ progress(a) }}</td>
      </tr>
    </tbody>
  </table>
</template>
