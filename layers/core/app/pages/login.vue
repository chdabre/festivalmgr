<!-- layers/core/app/pages/login.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import {
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  signInWithPopup,
} from 'firebase/auth'

definePageMeta({ layout: false })

const { t } = useI18n()
const auth = useFirebaseAuth()!
const email = ref('')
const sent = ref(false)
const error = ref<string | null>(null)

async function sendLink() {
  error.value = null
  try {
    await sendSignInLinkToEmail(auth, email.value, {
      url: window.location.origin + '/auth/complete',
      handleCodeInApp: true,
    })
    window.localStorage.setItem('festivalmgr.signInEmail', email.value)
    sent.value = true
  }
  catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Failed to send link'
  }
}

async function signInGoogle() {
  error.value = null
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
    await navigateTo('/')
  }
  catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Google sign-in failed'
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold">{{ t('auth.loginTitle') }}</h1>
      </template>

      <div v-if="sent" class="text-sm">
        We sent a sign-in link to <strong>{{ email }}</strong>. Open it in this browser to complete sign-in.
      </div>

      <form v-else class="space-y-4" @submit.prevent="sendLink">
        <UFormField :label="t('auth.emailPlaceholder')" name="email">
          <UInput v-model="email" type="email" required />
        </UFormField>
        <UButton type="submit" block>{{ t('auth.magicLinkLabel') }}</UButton>
        <USeparator label="or" />
        <UButton color="neutral" variant="subtle" block icon="i-simple-icons-google" @click="signInGoogle">
          {{ t('auth.googleLabel') }}
        </UButton>
        <UAlert v-if="error" color="error" :title="error" />
      </form>
    </UCard>
  </div>
</template>
