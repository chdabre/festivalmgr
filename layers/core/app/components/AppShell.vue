<!-- layers/core/app/components/AppShell.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import { signOut } from 'firebase/auth'

const auth = useFirebaseAuth()!
const { t } = useI18n()

const navItems = [
  { label: t('nav.events'),   to: '/events',           icon: 'i-lucide-calendar' },
  { label: t('nav.members'),  to: '/settings/members', icon: 'i-lucide-users' },
  { label: t('nav.settings'), to: '/settings',         icon: 'i-lucide-settings' },
]

async function doSignOut() {
  await signOut(auth)
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen grid grid-cols-[260px_1fr]">
    <aside class="border-r border-default p-4 flex flex-col gap-4">
      <div class="text-lg font-semibold">{{ t('app.title') }}</div>
      <UNavigationMenu :items="navItems" orientation="vertical" />
      <div class="mt-auto">
        <UButton variant="subtle" block @click="doSignOut">{{ t('nav.signOut') }}</UButton>
      </div>
    </aside>
    <main class="p-6">
      <slot />
    </main>
  </div>
</template>
