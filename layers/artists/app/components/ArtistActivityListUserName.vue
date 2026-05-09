<!-- layers/artists/app/components/ArtistActivityListUserName.vue -->
<script setup lang="ts">
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{ uid: string }>()
const user = useUserById(props.uid)
</script>

<template>
  <span class="font-medium">{{ user?.displayName ?? `${uid.slice(0, 6)}…` }}</span>
</template>
