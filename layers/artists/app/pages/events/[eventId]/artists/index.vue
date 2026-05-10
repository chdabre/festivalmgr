<!-- layers/artists/app/pages/events/[eventId]/artists/index.vue -->
<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useArtistList, type ArtistListFilter } from '#layers/artists/app/composables/useArtistList'
import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'
import type { ArtistStatus } from '#layers/artists/shared/types'

const route = useRoute()
const eventId = route.params.eventId as string
const { orgId, role, org } = await useOrg()

if (!orgId.value) {
  throw createError({ statusCode: 403, message: 'No organization on this account' })
}

const artists   = useArtistList(orgId.value, eventId)
const locations = useLocations(orgId.value, eventId)
const { evaluateForArtist } = useArtistChecklistTemplate(orgId.value, eventId)
const mut       = useArtistMutations(orgId.value, eventId)

const filter = ref<ArtistListFilter>({})
const search = ref('')

const STATUS_ORDER: ArtistStatus[] = ['planned', 'inquired', 'confirmed', 'declined', 'cancelled']

const observedCategories = computed(() => Array.from(new Set(artists.value.map((a) => a.category))))
const availableCategories = computed(() => {
  const fromOrg = org.value?.artistCategories ?? []
  const merged = new Set([...fromOrg, ...observedCategories.value])
  return Array.from(merged).filter(Boolean).sort()
})

function fuzzy(name: string, contactEmail: string | undefined, q: string): boolean {
  const needle = q.toLowerCase()
  return name.toLowerCase().includes(needle) || (contactEmail?.toLowerCase().includes(needle) ?? false)
}

const filtered = computed(() => {
  let xs = artists.value
  if (filter.value.status?.length) {
    xs = xs.filter((a) => filter.value.status!.includes(a.status))
  }
  if (filter.value.category?.length) {
    xs = xs.filter((a) => filter.value.category!.includes(a.category))
  }
  if (search.value.trim().length > 0) {
    xs = xs.filter((a) => fuzzy(a.name, a.primaryContact?.email, search.value.trim()))
  }
  return [...xs].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status)
    const sb = STATUS_ORDER.indexOf(b.status)
    if (sa !== sb) return sa - sb
    const ta = a.statusChangedAt?.toMillis?.() ?? 0
    const tb = b.statusChangedAt?.toMillis?.() ?? 0
    return ta - tb
  })
})

const canCreate = computed(() => role.value === 'director' || role.value === 'booker')

const newOpen  = ref(false)
const draft    = reactive({ name: '', category: '' })
const creating = ref(false)

async function onCreate() {
  if (!draft.name.trim() || !draft.category.trim() || creating.value) return
  creating.value = true
  try {
    const ref = await mut.createArtist({ name: draft.name.trim(), category: draft.category.trim() })
    newOpen.value = false
    draft.name = ''
    draft.category = ''
    await navigateTo(`/events/${eventId}/artists/${ref.id}`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <AppShell>
    <div class="flex justify-between items-center mb-4">
      <div>
        <NuxtLink :to="`/events/${eventId}`" class="text-sm text-muted hover:underline">← Event</NuxtLink>
        <h1 class="text-2xl font-semibold">Artists</h1>
      </div>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="newOpen = true">Add artist</UButton>
    </div>

    <ArtistFilters
      v-model="filter"
      v-model:search="search"
      :available-categories="availableCategories"
    />

    <UCard>
      <ArtistTable
        :artists="filtered"
        :evaluator="evaluateForArtist"
        :org-id="orgId!"
        :event-id="eventId"
        :locations="locations"
      />
    </UCard>

    <UModal v-model:open="newOpen" title="Add artist">
      <template #body>
        <form class="space-y-3" @submit.prevent="onCreate">
          <UFormField label="Name" required>
            <UInput v-model="draft.name" required />
          </UFormField>
          <UFormField label="Category" required>
            <UInput v-model="draft.category" :placeholder="availableCategories[0]" required />
          </UFormField>
          <p class="text-xs text-muted">
            Status defaults to <strong>planned</strong>. You can edit other fields on the next page.
          </p>
          <UButton type="submit" :loading="creating" :disabled="!draft.name || !draft.category">
            Create
          </UButton>
        </form>
      </template>
    </UModal>
  </AppShell>
</template>
