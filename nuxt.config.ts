export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/i18n',
  ],
  css: ['~/assets/css/main.css'],
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', file: 'en.json' },
    ],
    strategy: 'no_prefix',
  },
})
