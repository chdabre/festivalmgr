// layers/core/app/plugins/claim-membership.client.ts
import { watch } from 'vue'
import { useCurrentUser } from 'vuefire'

export default defineNuxtPlugin(async () => {
  const user = useCurrentUser()

  async function activate() {
    if (!user.value) return
    const { claimMembership } = useFunctions()
    try {
      const { activatedOrgIds } = await claimMembership({})
      if (activatedOrgIds.length > 0) {
        await user.value.getIdToken(true)
      }
    }
    catch {
      // Non-fatal: page guards handle the no-org case.
    }
  }

  await activate()
  watch(user, activate)
})
