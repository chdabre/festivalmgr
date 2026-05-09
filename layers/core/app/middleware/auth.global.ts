// layers/core/app/middleware/auth.global.ts
import { getCurrentUser } from 'vuefire'

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = to.path === '/login' || to.path.startsWith('/auth/')
  if (isPublic) return

  // vuefire's getCurrentUser() relies on Vue's inject() and only works inside
  // a component setup. In a route middleware on SSR there is no component
  // instance, and nuxt-vuefire creates a per-request named firebase app
  // rather than the default — so getApp() falls back and throws. Read the
  // user from the H3 request context (set by nuxt-vuefire's
  // plugin-authenticate-user.server) on the server.
  const user = import.meta.server
    ? useRequestEvent()?.context.user ?? null
    : await getCurrentUser()

  if (!user) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
