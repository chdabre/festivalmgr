<!-- layers/artists/app/components/ArtistActivityList.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityLogEntry } from '#layers/artists/shared/types'
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  entries: (ActivityLogEntry & { id: string })[]
}>()

const FIELD_LABELS: Record<string, string> = {
  status:                'Status',
  statusChangedAt:       'Status changed at',
  name:                  'Name',
  category:              'Category',
  shortDescription:      'Short description',
  origin:                'Origin',
  links:                 'Links',
  primaryContact:        'Primary contact',
  responsibleUserId:     'Responsible user',
  fee:                   'Fee',
  travelBudget:          'Travel budget',
  accommodation:         'Accommodation',
  daysPresent:           'Days present',
  dealNotes:             'Deal notes',
  intendedDay:           'Intended day',
  intendedLocationId:    'Intended location',
  performanceDurationMin:'Performance duration',
  performanceNote:       'Performance note',
  checklist:             'Checklist',
  comment:               'Comment',
  deletedAt:             'Soft delete',
}

function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  // Fall back to the raw dot path so we don't lose information.
  return field
}

function valueLabel(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function relativeTime(at: { toMillis?: () => number; seconds?: number } | null | undefined): string {
  if (!at) return ''
  const ms = typeof at.toMillis === 'function' ? at.toMillis() : (at.seconds ?? 0) * 1000
  const diffSec = (Date.now() - ms) / 1000
  if (diffSec < 60) return rtf.format(-Math.round(diffSec), 'second')
  if (diffSec < 3600) return rtf.format(-Math.round(diffSec / 60), 'minute')
  if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour')
  return rtf.format(-Math.round(diffSec / 86400), 'day')
}
</script>

<template>
  <div v-if="entries.length === 0" class="text-sm text-muted py-4">No activity yet.</div>
  <ul v-else class="space-y-2">
    <li v-for="e in entries" :key="e.id" class="text-sm flex items-baseline gap-2">
      <ArtistActivityListUserName :uid="e.uid" />
      <span class="text-muted">changed</span>
      <span class="font-medium">{{ fieldLabel(e.field) }}</span>
      <span class="text-muted">from</span>
      <code class="text-xs bg-elevated px-1 rounded">{{ valueLabel(e.before) }}</code>
      <span class="text-muted">to</span>
      <code class="text-xs bg-elevated px-1 rounded">{{ valueLabel(e.after) }}</code>
      <span class="text-muted ml-auto">{{ relativeTime(e.at) }}</span>
    </li>
  </ul>
</template>
