export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-vuefire',
  ],
  css: ['~/assets/css/main.css'],
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', file: 'en.json' },
    ],
    strategy: 'no_prefix',
  },
  vuefire: {
    config: {
      apiKey:            process.env.NUXT_PUBLIC_FIREBASE_API_KEY,
      authDomain:        process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId:         process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket:     process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId:             process.env.NUXT_PUBLIC_FIREBASE_APP_ID,
    },
    auth: { enabled: true },
    emulators: {
      enabled: process.env.FIREBASE_USE_EMULATOR === '1',
      auth:      { host: '127.0.0.1', port: 9099 },
      firestore: { host: '127.0.0.1', port: 8080 },
      functions: { host: '127.0.0.1', port: 5001 },
      storage:   { host: '127.0.0.1', port: 9199 },
    },
  },
})
