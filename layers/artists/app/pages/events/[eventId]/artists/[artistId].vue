<!-- layers/artists/app/pages/events/[eventId]/artists/[artistId].vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useArtist } from '#layers/artists/app/composables/useArtist'
import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'
import { useArtistResources } from '#layers/artists/app/composables/useArtistResources'
import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import { useArtistActivity } from '#layers/artists/app/composables/useArtistActivity'
import { useDebouncedFn } from '#layers/artists/app/composables/useDebouncedFn'
import type { Artist, ArtistStatus, ResourceLink } from '#layers/artists/shared/types'

const route = useRoute()
const eventId = route.params.eventId as string
const artistId = route.params.artistId as string
const { orgId, role } = await useOrg()
if (!orgId.value) throw createError({ statusCode: 403, message: 'No organization on this account' })

const artist    = useArtist(orgId.value, eventId, artistId)
const locations = useLocations(orgId.value, eventId)
const activity  = useArtistActivity(orgId.value, eventId, artistId)
const { evaluateForArtist } = useArtistChecklistTemplate(orgId.value, eventId)
const mut       = useArtistMutations(orgId.value, eventId)
const resources = useArtistResources(orgId.value, eventId, artistId)

const evaluatedItems = computed(() =>
  artist.value ? evaluateForArtist(artist.value) : [],
)

const canEdit = computed(() => {
  const r = role.value
  return {
    name:        r === 'director' || r === 'booker',
    identity:    r === 'director' || r === 'booker',
    prFields:    r === 'director' || r === 'booker' || r === 'pr',
    booking:     r === 'director' || r === 'booker',
    deal:        r === 'director' || r === 'booker',
    performance: r === 'director' || r === 'booker' || r === 'production',
    checklist:   r === 'director' || r === 'booker' || r === 'production',
    comment:     r === 'director' || r === 'booker' || r === 'production',
    transition:  r === 'director' || r === 'booker',
    softDelete:  r === 'director',
  }
})

// One debounced updater per artist field. Each call captures the
// current snapshot's prior value so the activity log records before/after.
function makeFieldUpdater<K extends keyof Artist>(key: K) {
  return useDebouncedFn(async (value: Artist[K]) => {
    if (!artist.value) return
    const before = { [key]: artist.value[key] } as Partial<Artist>
    const patch  = { [key]: value } as Partial<Artist>
    await mut.updateArtist(artistId, patch, before)
  }, 500)
}

const updateName             = makeFieldUpdater('name')
const updateCategory         = makeFieldUpdater('category')
const updateOrigin           = makeFieldUpdater('origin')
const updateShortDescription = makeFieldUpdater('shortDescription')
const updateLinks            = makeFieldUpdater('links')
const updatePrimaryContact   = makeFieldUpdater('primaryContact')
const updateFee              = makeFieldUpdater('fee')
const updateTravelBudget     = makeFieldUpdater('travelBudget')
const updateAccommodation    = makeFieldUpdater('accommodation')
const updateDaysPresent      = makeFieldUpdater('daysPresent')
const updateDealNotes        = makeFieldUpdater('dealNotes')
const updateIntendedDay      = makeFieldUpdater('intendedDay')
const updateIntendedLocation = makeFieldUpdater('intendedLocationId')
const updatePerformanceDur   = makeFieldUpdater('performanceDurationMin')
const updatePerformanceNote  = makeFieldUpdater('performanceNote')
const updateComment          = makeFieldUpdater('comment')

async function onTransition(payload: { from: ArtistStatus; to: ArtistStatus }) {
  if (!artist.value) return
  await mut.transitionStatus(artistId, payload.to, payload.from)
}

async function onChecklistToggle(payload: { itemId: string; done: boolean }) {
  if (!artist.value) return
  const cur = artist.value.checklist?.[payload.itemId] ?? { done: false }
  const next = { ...cur, done: payload.done }
  await mut.updateArtist(
    artistId,
    { checklist: { ...artist.value.checklist, [payload.itemId]: next } },
    { checklist: artist.value.checklist },
  )
}

async function onAddResource(p: { itemId: string; link: { url: string; title?: string }; current: ResourceLink[] }) {
  await resources.addResource(p.itemId, p.link, p.current)
}
async function onRemoveResource(p: { itemId: string; url: string; current: ResourceLink[] }) {
  await resources.removeResource(p.itemId, p.url, p.current)
}

async function onSoftDelete() {
  if (!artist.value) return
  if (!confirm(`Delete "${artist.value.name}"? You can recover it from the database within retention window.`)) return
  await mut.softDeleteArtist(artistId)
  await navigateTo(`/events/${eventId}/artists`)
}

const feeAmount      = computed({ get: () => artist.value?.fee?.amount ?? 0,         set: (v) => updateFee({ amount: Number(v), currency: artist.value?.fee?.currency ?? 'CHF' }) })
const feeCurrency    = computed({ get: () => artist.value?.fee?.currency ?? 'CHF',   set: (v) => updateFee({ amount: artist.value?.fee?.amount ?? 0, currency: String(v) }) })
const travelAmount   = computed({ get: () => artist.value?.travelBudget?.amount ?? 0,set: (v) => updateTravelBudget({ amount: Number(v), currency: artist.value?.travelBudget?.currency ?? 'CHF' }) })
const travelCurrency = computed({ get: () => artist.value?.travelBudget?.currency ?? 'CHF', set: (v) => updateTravelBudget({ amount: artist.value?.travelBudget?.amount ?? 0, currency: String(v) }) })

const websiteLink   = computed({ get: () => artist.value?.links?.website ?? '',   set: (v) => updateLinks({ ...(artist.value?.links ?? {}), website: String(v) || undefined }) })
const instagramLink = computed({ get: () => artist.value?.links?.instagram ?? '', set: (v) => updateLinks({ ...(artist.value?.links ?? {}), instagram: String(v) || undefined }) })
</script>

<template>
  <AppShell>
    <NuxtLink :to="`/events/${eventId}/artists`" class="text-sm text-muted hover:underline">← All artists</NuxtLink>

    <div v-if="!artist" class="py-12 text-center text-muted">Loading…</div>

    <template v-else>
      <ArtistDetailHeader
        :artist="artist"
        :can-edit-name="canEdit.name"
        :can-transition="canEdit.transition"
        @update:name="updateName"
        @transition="onTransition"
      />

      <UCard class="mb-4"><template #header>Identity</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Category">
            <UInput :model-value="artist.category" :disabled="!canEdit.identity" @update:model-value="(v) => updateCategory(String(v))" />
          </UFormField>
          <UFormField label="Origin">
            <UInput :model-value="artist.origin ?? ''" :disabled="!canEdit.identity" @update:model-value="(v) => updateOrigin(String(v))" />
          </UFormField>
          <UFormField label="Short description (PR)" class="md:col-span-2">
            <UTextarea :model-value="artist.shortDescription ?? ''" :disabled="!canEdit.prFields" @update:model-value="(v) => updateShortDescription(String(v))" />
          </UFormField>
          <UFormField label="Website">
            <UInput v-model="websiteLink" :disabled="!canEdit.prFields" placeholder="https://" />
          </UFormField>
          <UFormField label="Instagram">
            <UInput v-model="instagramLink" :disabled="!canEdit.prFields" placeholder="@handle" />
          </UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Booking</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Primary contact name">
            <UInput
              :model-value="artist.primaryContact?.name ?? ''"
              :disabled="!canEdit.booking"
              @update:model-value="(v) => updatePrimaryContact({ ...(artist?.primaryContact ?? {}), name: String(v) || undefined })"
            />
          </UFormField>
          <UFormField label="Primary contact email">
            <UInput
              :model-value="artist.primaryContact?.email ?? ''"
              type="email"
              :disabled="!canEdit.booking"
              @update:model-value="(v) => updatePrimaryContact({ ...(artist?.primaryContact ?? {}), email: String(v) || undefined })"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Deal</template>
        <div class="grid gap-3 md:grid-cols-3">
          <UFormField label="Fee amount"><UInput v-model.number="feeAmount" type="number" min="0" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Currency"><UInput v-model="feeCurrency" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Days present"><UInput :model-value="artist.daysPresent ?? 0" type="number" min="0" :disabled="!canEdit.deal" @update:model-value="(v) => updateDaysPresent(Number(v))" /></UFormField>
          <UFormField label="Travel budget"><UInput v-model.number="travelAmount" type="number" min="0" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Travel currency"><UInput v-model="travelCurrency" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Accommodation" class="md:col-span-3"><UInput :model-value="artist.accommodation ?? ''" :disabled="!canEdit.deal" @update:model-value="(v) => updateAccommodation(String(v))" /></UFormField>
          <UFormField label="Deal notes" class="md:col-span-3"><UTextarea :model-value="artist.dealNotes ?? ''" :disabled="!canEdit.deal" @update:model-value="(v) => updateDealNotes(String(v))" /></UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Performance</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Intended day"><UInput :model-value="artist.intendedDay ?? ''" type="date" :disabled="!canEdit.performance" @update:model-value="(v) => updateIntendedDay(String(v) || undefined)" /></UFormField>
          <UFormField label="Intended location">
            <USelect
              :model-value="artist.intendedLocationId ?? ''"
              :items="locations.map((l) => ({ label: l.name, value: l.id }))"
              :disabled="!canEdit.performance"
              @update:model-value="(v) => updateIntendedLocation(String(v) || undefined)"
            />
          </UFormField>
          <UFormField label="Duration (min)"><UInput :model-value="artist.performanceDurationMin ?? 0" type="number" min="0" :disabled="!canEdit.performance" @update:model-value="(v) => updatePerformanceDur(Number(v))" /></UFormField>
          <UFormField label="Performance note"><UInput :model-value="artist.performanceNote ?? ''" :disabled="!canEdit.performance" @update:model-value="(v) => updatePerformanceNote(String(v))" /></UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Checklist</template>
        <ArtistChecklistSection
          :items="evaluatedItems"
          :artist="artist"
          :can-edit="canEdit.checklist"
          @toggle="onChecklistToggle"
          @add-resource="onAddResource"
          @remove-resource="onRemoveResource"
        />
      </UCard>

      <UCard class="mb-4"><template #header>Comment</template>
        <UTextarea :model-value="artist.comment ?? ''" :disabled="!canEdit.comment" @update:model-value="(v) => updateComment(String(v))" />
      </UCard>

      <UCard class="mb-4"><template #header>Activity</template>
        <ArtistActivityList :entries="activity" />
      </UCard>

      <div v-if="canEdit.softDelete" class="mt-6">
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="onSoftDelete">
          Delete artist
        </UButton>
      </div>
    </template>
  </AppShell>
</template>
