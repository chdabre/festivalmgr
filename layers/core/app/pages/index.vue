<!-- layers/core/app/pages/index.vue -->
<script setup lang="ts">
const { org, role } = await useOrg()
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-4">Welcome</h1>
    <p v-if="org">You're in <strong>{{ org.name }}</strong> as <strong>{{ role }}</strong>.</p>
    <UAlert v-else color="warning" title="No organization yet" description="Ask a director to invite you, or run scripts/seed-director.ts to create one." />
  </AppShell>
</template>
