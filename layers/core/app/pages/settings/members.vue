<!-- layers/core/app/pages/settings/members.vue -->
<script setup lang="ts">
import type { Role } from '#layers/core/shared/types'

const { orgId, role } = await useOrg()
const fns = useFunctions()
const toast = useToast()

const memberships = orgId.value ? useMemberships(orgId.value) : ref([])
const canManage = computed(() => role.value === 'director')

const inviteEmail = ref('')
const inviteRole = ref<Role>('crew')
const submitting = ref(false)

async function invite() {
  if (!orgId.value || !inviteEmail.value) return
  submitting.value = true
  try {
    await fns.setMembership({
      orgId: orgId.value,
      email: inviteEmail.value,
      role: inviteRole.value,
    })
    toast.add({ title: 'Invite sent', color: 'success' })
    inviteEmail.value = ''
  }
  catch (e: unknown) {
    toast.add({ title: 'Invite failed', description: (e as Error)?.message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}

async function revoke(membershipId: string) {
  if (!orgId.value) return
  try {
    await fns.revokeMembership({ orgId: orgId.value, membershipId })
    toast.add({ title: 'Revoked', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Revoke failed', description: (e as Error)?.message, color: 'error' })
  }
}

const roleOptions: Role[] = ['director', 'booker', 'production', 'finance', 'pr', 'crew']
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-6">Members</h1>

    <UCard v-if="canManage" class="mb-6">
      <template #header>
        <h2 class="font-medium">Invite teammate</h2>
      </template>
      <form class="flex gap-2 items-end" @submit.prevent="invite">
        <UFormField label="Email" class="flex-1">
          <UInput v-model="inviteEmail" type="email" required />
        </UFormField>
        <UFormField label="Role">
          <USelect v-model="inviteRole" :items="roleOptions" />
        </UFormField>
        <UButton type="submit" :loading="submitting">Invite</UButton>
      </form>
    </UCard>

    <UCard>
      <MemberRow
        v-for="m in memberships"
        :key="m.id"
        :membership="m"
        :can-revoke="canManage"
        @revoke="revoke" />
      <p v-if="memberships.length === 0" class="text-sm text-muted">No members yet.</p>
    </UCard>
  </AppShell>
</template>
