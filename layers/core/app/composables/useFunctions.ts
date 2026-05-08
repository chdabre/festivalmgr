import { useNuxtApp } from '#app'
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import type { FirebaseApp } from 'firebase/app'

type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

type Callables = {
  setMembership: (data: {
    orgId: string
    email: string
    role: Role
  }) => Promise<{ membershipId: string }>

  revokeMembership: (data: {
    orgId: string
    membershipId: string
  }) => Promise<{ ok: true }>

  claimMembership: (data: Record<string, never>) => Promise<{
    activatedOrgIds: string[]
  }>
}

export function useFunctions(): Callables {
  const { $firebaseApp } = useNuxtApp() as unknown as { $firebaseApp: FirebaseApp }
  const fns: Functions = getFunctions($firebaseApp, 'us-central1')
  const wrap = <K extends keyof Callables>(name: K) =>
    (async (data: Parameters<Callables[K]>[0]) =>
      (await httpsCallable(fns, name as string)(data)).data) as Callables[K]
  return {
    setMembership:    wrap('setMembership'),
    revokeMembership: wrap('revokeMembership'),
    claimMembership:  wrap('claimMembership'),
  }
}
