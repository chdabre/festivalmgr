<!-- layers/core/app/pages/events/[eventId].vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore'

const route = useRoute()
const eventId = route.params.eventId as string
const { orgId, role } = await useOrg()
const db = useFirestore()

if (!orgId.value) throw createError({ statusCode: 403, message: 'No organization on this account' })

const event = useEvent(orgId.value, eventId)
const locations = useLocations(orgId.value, eventId)
const canEdit = computed(() => role.value === 'director' || role.value === 'production')

const draft = reactive({ name: '', capacity: undefined as number | undefined })

async function addLocation() {
  if (!orgId.value || !draft.name) return
  await addDoc(collection(db, 'organizations', orgId.value, 'events', eventId, 'locations'), {
    name: draft.name,
    capacity: draft.capacity ?? null,
    order: locations.value.length + 1,
  })
  draft.name = ''
  draft.capacity = undefined
}

async function removeLocation(id: string) {
  if (!orgId.value) return
  await deleteDoc(doc(db, 'organizations', orgId.value, 'events', eventId, 'locations', id))
}
</script>

<template>
  <AppShell>
    <NuxtLink to="/events" class="text-sm text-muted hover:underline">← All events</NuxtLink>
    <h1 v-if="event" class="text-2xl font-semibold mb-6">{{ event.name }}</h1>

    <UCard>
      <template #header><h2 class="font-medium">Locations</h2></template>

      <LocationListItem
        v-for="l in locations"
        :key="l.id"
        :location="l"
        :can-edit="canEdit"
        @remove="removeLocation" />
      <p v-if="locations.length === 0" class="text-sm text-muted">No locations yet.</p>

      <form v-if="canEdit" class="flex gap-2 items-end mt-4" @submit.prevent="addLocation">
        <UFormField label="Name" class="flex-1"><UInput v-model="draft.name" required /></UFormField>
        <UFormField label="Capacity"><UInput v-model.number="draft.capacity" type="number" min="0" /></UFormField>
        <UButton type="submit">Add</UButton>
      </form>
    </UCard>
  </AppShell>
</template>
