<!-- layers/core/app/pages/settings/index.vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { doc, updateDoc } from 'firebase/firestore'
import type { ModuleKey } from '#layers/core/shared/types'

const { org, orgId, role } = await useOrg()
const db = useFirestore()
const toast = useToast()

const editable = reactive({
  name: org.value?.name ?? '',
  defaultLocale: org.value?.defaultLocale ?? 'en',
  defaultCurrency: org.value?.defaultCurrency ?? 'CHF',
  enabledModules: [...(org.value?.enabledModules ?? [])] as ModuleKey[],
})

const allModules: ModuleKey[] = ['artists', 'budget', 'booking', 'riders', 'schedule']
const canEdit = computed(() => role.value === 'director')

async function save() {
  if (!orgId.value) return
  await updateDoc(doc(db, 'organizations', orgId.value), {
    name: editable.name,
    defaultLocale: editable.defaultLocale,
    defaultCurrency: editable.defaultCurrency,
    enabledModules: editable.enabledModules,
  })
  toast.add({ title: 'Settings saved', color: 'success' })
}
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-6">Organization settings</h1>

    <UCard v-if="org" class="max-w-xl">
      <form class="space-y-4" @submit.prevent="save">
        <UFormField label="Name" name="name">
          <UInput v-model="editable.name" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Default locale" name="defaultLocale">
          <UInput v-model="editable.defaultLocale" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Default currency" name="defaultCurrency">
          <UInput v-model="editable.defaultCurrency" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Enabled modules" name="enabledModules">
          <div class="flex flex-wrap gap-2">
            <UCheckbox
              v-for="m in allModules"
              :key="m"
              :model-value="editable.enabledModules.includes(m)"
              :disabled="!canEdit"
              :label="m"
              @update:model-value="(checked: boolean) => editable.enabledModules = checked
                ? [...editable.enabledModules, m]
                : editable.enabledModules.filter(x => x !== m)" />
          </div>
        </UFormField>
        <UButton v-if="canEdit" type="submit">Save</UButton>
      </form>
    </UCard>
    <UAlert v-else color="warning" title="No organization on this account" />
  </AppShell>
</template>
