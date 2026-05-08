<!-- layers/core/app/pages/auth/complete.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'

definePageMeta({ layout: false })

const auth = useFirebaseAuth()!
const status = ref<'pending' | 'ok' | 'error'>('pending')
const error = ref<string | null>(null)

onMounted(async () => {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    status.value = 'error'
    error.value = 'This page expects a magic link.'
    return
  }
  let email = window.localStorage.getItem('festivalmgr.signInEmail')
  if (!email) email = window.prompt('Confirm the email address you signed in with') ?? ''
  try {
    await signInWithEmailLink(auth, email, window.location.href)
    window.localStorage.removeItem('festivalmgr.signInEmail')
    status.value = 'ok'
    await navigateTo('/')
  }
  catch (e: unknown) {
    status.value = 'error'
    error.value = (e as Error)?.message ?? 'Sign-in failed'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard>
      <p v-if="status === 'pending'">Completing sign-in…</p>
      <UAlert v-else-if="status === 'error'" color="error" :title="error ?? 'Sign-in failed'" />
      <p v-else>Signed in. Redirecting…</p>
    </UCard>
  </div>
</template>
