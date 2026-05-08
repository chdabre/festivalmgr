<!-- layers/core/app/components/MemberRow.vue -->
<script setup lang="ts">
import type { Membership, Role } from '#layers/core/shared/types'

const props = defineProps<{
  membership: Membership & { id: string }
  canRevoke: boolean
}>()
const emit = defineEmits<{ revoke: [id: string] }>()

type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const roleColor: Record<Role, BadgeColor> = {
  director: 'primary', booker: 'info', production: 'success',
  finance: 'warning', pr: 'secondary', crew: 'neutral',
}
const statusColor: Record<Membership['status'], BadgeColor> = {
  active: 'success', pending: 'warning', revoked: 'neutral',
}
</script>

<template>
  <div class="flex items-center gap-3 py-2 border-b border-default last:border-0">
    <div class="flex-1">
      <div class="font-medium">{{ props.membership.email }}</div>
      <div class="text-xs text-muted">{{ props.membership.userId ?? '—' }}</div>
    </div>
    <UBadge :color="roleColor[props.membership.role]" variant="subtle">{{ props.membership.role }}</UBadge>
    <UBadge :color="statusColor[props.membership.status]" variant="subtle">{{ props.membership.status }}</UBadge>
    <UButton
      v-if="props.canRevoke && props.membership.status !== 'revoked'"
      size="xs"
      color="error"
      variant="ghost"
      @click="emit('revoke', props.membership.id)">
      Revoke
    </UButton>
  </div>
</template>
