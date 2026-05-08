<!-- layers/core/app/pages/events/index.vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { addDoc, collection, Timestamp } from 'firebase/firestore'

const { orgId, role } = await useOrg()
const db = useFirestore()
const events = orgId.value ? useEvents(orgId.value) : ref([])
const canCreate = computed(() => role.value === 'director')

const open = ref(false)
const draft = reactive({ name: '', slug: '', start: '', end: '' })

async function create() {
  if (!orgId.value) return
  await addDoc(collection(db, 'organizations', orgId.value, 'events'), {
    name: draft.name,
    slug: draft.slug,
    primaryLocale: 'en',
    primaryContacts: [],
    status: 'planning',
    dates: {
      start: Timestamp.fromDate(new Date(draft.start)),
      end: Timestamp.fromDate(new Date(draft.end)),
    },
    publishToPublic: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  })
  open.value = false
  Object.assign(draft, { name: '', slug: '', start: '', end: '' })
}
</script>

<template>
  <AppShell>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold">Events</h1>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="open = true">New event</UButton>
    </div>

    <div class="grid gap-3">
      <EventCard v-for="e in events" :key="e.id" :event="e" />
      <UAlert v-if="events.length === 0" color="neutral" title="No events yet" />
    </div>

    <UModal v-model:open="open" title="New event">
      <template #body>
        <form class="space-y-3" @submit.prevent="create">
          <UFormField label="Name"><UInput v-model="draft.name" required /></UFormField>
          <UFormField label="Slug"><UInput v-model="draft.slug" required /></UFormField>
          <UFormField label="Start date"><UInput v-model="draft.start" type="date" required /></UFormField>
          <UFormField label="End date"><UInput v-model="draft.end" type="date" required /></UFormField>
          <UButton type="submit">Create</UButton>
        </form>
      </template>
    </UModal>
  </AppShell>
</template>
