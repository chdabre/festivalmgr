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
    // Workaround for nuxt-vuefire@1.1.2: the module's auto-derivation of
    // admin.options.projectId from the emulator detection block doesn't
    // propagate to runtimeConfig (the runtimeConfig.vuefire.admin reference
    // is captured before the mutation). Set it explicitly so that
    // verifySessionCookie can find the project ID.
    admin: {
      options: {
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
    },
    auth: {
      enabled: true,
      // In emulator dev we serve over http://localhost and Safari refuses
      // to store Secure cookies on insecure origins (Chrome/Firefox have a
      // localhost exception, Safari does not). Drop the Secure flag in dev
      // and keep the default in production where the site is HTTPS.
      sessionCookie: process.env.FIREBASE_USE_EMULATOR === '1' ? { secure: false } : true,
    },
    emulators: {
      enabled: process.env.FIREBASE_USE_EMULATOR === '1',
      auth:      { host: '127.0.0.1', port: 9099 },
      firestore: { host: '127.0.0.1', port: 8080 },
      functions: { host: '127.0.0.1', port: 5001 },
      storage:   { host: '127.0.0.1', port: 9199 },
    },
  },
})
