<!-- layers/artists/app/components/ArtistTableResponsibleCell.vue -->
<script setup lang="ts">
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  uid: string | null | undefined
}>()

const user = useUserById(props.uid)
</script>

<template>
  <span class="text-sm">{{ user?.displayName ?? (uid ? `${uid.slice(0, 6)}…` : '—') }}</span>
</template>
