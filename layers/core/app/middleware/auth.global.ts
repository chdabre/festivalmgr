// layers/core/app/middleware/auth.global.ts
import { getCurrentUser } from 'vuefire'

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = to.path === '/login' || to.path.startsWith('/auth/')
  if (isPublic) return
  const user = await getCurrentUser()
  if (!user) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
