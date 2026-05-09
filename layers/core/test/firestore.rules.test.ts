import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { actingAs, actingAsAnon, getEnv, seedAsAdmin, type TestUser } from './helpers/rules-env'

let env: RulesTestEnvironment

beforeAll(async () => { env = await getEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const ORG_A = 'lila'
const ORG_B = 'other'

const DIRECTOR_A: TestUser = { uid: 'dirA', orgId: ORG_A, role: 'director', orgs: { [ORG_A]: 'director' } }
const BOOKER_A:   TestUser = { uid: 'bokA', orgId: ORG_A, role: 'booker',   orgs: { [ORG_A]: 'booker' } }
const PROD_A:     TestUser = { uid: 'prdA', orgId: ORG_A, role: 'production', orgs: { [ORG_A]: 'production' } }
const FIN_A:      TestUser = { uid: 'finA', orgId: ORG_A, role: 'finance',  orgs: { [ORG_A]: 'finance' } }
const PR_A:       TestUser = { uid: 'prA',  orgId: ORG_A, role: 'pr',       orgs: { [ORG_A]: 'pr' } }
const CREW_A:     TestUser = { uid: 'crwA', orgId: ORG_A, role: 'crew',     orgs: { [ORG_A]: 'crew' } }
const DIRECTOR_B: TestUser = { uid: 'dirB', orgId: ORG_B, role: 'director', orgs: { [ORG_B]: 'director' } }

const VALID_ORG = {
  name: 'lila. queer festival e.V.',
  slug: 'lila',
  defaultLocale: 'en',
  defaultCurrency: 'CHF',
  enabledModules: ['artists', 'schedule'],
  createdAt: Timestamp.now(),
}

describe('rules pipeline smoke test', () => {
  it('default-deny: anon read of an unmapped path is denied', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, 'random/unknown')))
  })
})

describe('organizations/{orgId}', () => {
  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}`), VALID_ORG)
    })
  })

  it('member can read', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}`)))
  })

  it('cross-tenant member cannot read', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}`)))
  })

  it('anon cannot read', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}`)))
  })

  it('director can update', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_A}`), { defaultCurrency: 'EUR' }))
  })

  it('non-director cannot update', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(doc(db, `organizations/${ORG_A}`), { defaultCurrency: 'EUR' }))
  })

  it('rejects slug change on update', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(updateDoc(doc(db, `organizations/${ORG_A}`), { slug: 'changed' }))
  })

  it('rejects update missing required fields', async () => {
    // updates that don't touch required fields are fine; this test verifies the
    // *result document* validation by writing a setDoc that drops `name`.
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}`), {
      slug: 'lila',
      defaultLocale: 'en',
      defaultCurrency: 'CHF',
      enabledModules: ['artists'],
      createdAt: Timestamp.now(),
      // name omitted
    }))
  })

  it('client cannot create org', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `organizations/new-org`), VALID_ORG))
  })

  it('client cannot delete org', async () => {
    const db = actingAs(env, DIRECTOR_A)
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(db, `organizations/${ORG_A}`)))
  })
})

describe('organizations/{orgId}/memberships/{userId}', () => {
  const MEMBERSHIP_A_DIRECTOR = {
    userId: DIRECTOR_A.uid,
    role: 'director',
    invitedBy: 'seed',
    invitedAt: Timestamp.now(),
    acceptedAt: Timestamp.now(),
    status: 'active',
  }

  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}/memberships/${DIRECTOR_A.uid}`), MEMBERSHIP_A_DIRECTOR)
    })
  })

  it('member can read', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/memberships/${DIRECTOR_A.uid}`)))
  })

  it('cross-tenant member cannot read', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/memberships/${DIRECTOR_A.uid}`)))
  })

  it('director cannot create membership from client', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/memberships/newUser`), {
      userId: 'newUser',
      role: 'crew',
      invitedBy: DIRECTOR_A.uid,
      invitedAt: Timestamp.now(),
      status: 'pending',
    }))
  })

  it('crew cannot create membership from client', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/memberships/newUser`), {
      userId: 'newUser',
      role: 'crew',
      invitedBy: CREW_A.uid,
      invitedAt: Timestamp.now(),
      status: 'pending',
    }))
  })

  it('director cannot update membership from client', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(updateDoc(doc(db, `organizations/${ORG_A}/memberships/${DIRECTOR_A.uid}`), { role: 'crew' }))
  })

  it('director cannot delete membership from client', async () => {
    const db = actingAs(env, DIRECTOR_A)
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(db, `organizations/${ORG_A}/memberships/${DIRECTOR_A.uid}`)))
  })
})

describe('organizations/{orgId}/events/{eventId}', () => {
  const VALID_EVENT = {
    name: 'lila. queer festival 2025',
    slug: 'lila-2025',
    primaryLocale: 'en',
    status: 'planning',
    dates: { start: Timestamp.now(), end: Timestamp.now() },
    publishToPublic: false,
    createdAt: Timestamp.now(),
  }

  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}/events/lila-2025`), VALID_EVENT)
    })
  })

  it('member can read', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/events/lila-2025`)))
  })

  it('cross-tenant member cannot read', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/lila-2025`)))
  })

  it('director can create', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev' }))
  })

  it('booker can create', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev' }))
  })

  it('production can create', async () => {
    const db = actingAs(env, PROD_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev' }))
  })

  it('pr cannot create', async () => {
    const db = actingAs(env, PR_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev' }))
  })

  it('crew cannot create', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev' }))
  })

  it('director can delete', async () => {
    const db = actingAs(env, DIRECTOR_A)
    const { deleteDoc } = await import('firebase/firestore')
    await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG_A}/events/lila-2025`)))
  })

  it('booker cannot delete', async () => {
    const db = actingAs(env, BOOKER_A)
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(db, `organizations/${ORG_A}/events/lila-2025`)))
  })

  it('rejects slug change on update', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(updateDoc(doc(db, `organizations/${ORG_A}/events/lila-2025`), { slug: 'changed' }))
  })

  it('rejects invalid status enum', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...VALID_EVENT, slug: 'newev', status: 'bogus' }))
  })

  it('rejects create missing required field', async () => {
    const db = actingAs(env, DIRECTOR_A)
    const { name, ...rest } = VALID_EVENT
    void name
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/newev`), { ...rest, slug: 'newev' }))
  })
})

describe('organizations/{orgId}/events/{eventId}/locations/{locationId}', () => {
  const VALID_LOCATION = { name: 'Aktionshalle', order: 1 }

  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}/events/lila-2025/locations/loc1`), VALID_LOCATION)
    })
  })

  it('member can read', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc1`)))
  })

  it('director can write', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum', order: 2 }))
  })

  it('production can write', async () => {
    const db = actingAs(env, PROD_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum', order: 2 }))
  })

  it('booker cannot write', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum', order: 2 }))
  })

  it('crew cannot write', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum', order: 2 }))
  })

  it('cross-tenant director cannot write', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum', order: 2 }))
  })

  it('rejects create missing required field', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/events/lila-2025/locations/loc2`), { name: 'Clubraum' }))
  })
})

describe('users/{uid}', () => {
  const USER_A_DIRECTOR = {
    email: 'director@example.com',
    displayName: 'Dir A',
    orgIds: [ORG_A],
    createdAt: Timestamp.now(),
  }
  const USER_B_DIRECTOR = {
    email: 'directorB@example.com',
    displayName: 'Dir B',
    orgIds: [ORG_B],
    createdAt: Timestamp.now(),
  }

  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${DIRECTOR_A.uid}`), USER_A_DIRECTOR)
      await setDoc(doc(ctx.firestore(), `users/${DIRECTOR_B.uid}`), USER_B_DIRECTOR)
    })
  })

  it('user can read own doc', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(getDoc(doc(db, `users/${DIRECTOR_A.uid}`)))
  })

  it('same-org member can read another user doc', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `users/${DIRECTOR_A.uid}`)))
  })

  it('cross-org user cannot read', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(getDoc(doc(db, `users/${DIRECTOR_A.uid}`)))
  })

  it('anon cannot read', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, `users/${DIRECTOR_A.uid}`)))
  })

  it('user can update own doc', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(updateDoc(doc(db, `users/${DIRECTOR_A.uid}`), { displayName: 'Director Renamed' }))
  })

  it('user cannot update another user doc', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(updateDoc(doc(db, `users/${DIRECTOR_A.uid}`), { displayName: 'Hacked' }))
  })
})

describe('organizations/{orgId}/shareLinks/{token}', () => {
  const VALID_SHARELINK = {
    docPath: `organizations/${ORG_A}/events/lila-2025/artists/abc123`,
    kind: 'artist-infosheet',
    allowedFields: ['name', 'stage'],
    createdBy: DIRECTOR_A.uid,
    createdAt: Timestamp.now(),
  }

  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}/shareLinks/tkn1`), VALID_SHARELINK)
    })
  })

  it('member can read', async () => {
    const db = actingAs(env, CREW_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn1`)))
  })

  it('cross-tenant member cannot read', async () => {
    const db = actingAs(env, DIRECTOR_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn1`)))
  })

  it('anon cannot read', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn1`)))
  })

  it('director can create', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn2`), VALID_SHARELINK))
  })

  it('booker can create', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn2`), VALID_SHARELINK))
  })

  it('pr can create', async () => {
    const db = actingAs(env, PR_A)
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn2`), VALID_SHARELINK))
  })

  it('crew cannot create', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(setDoc(doc(db, `organizations/${ORG_A}/shareLinks/tkn2`), VALID_SHARELINK))
  })
})

describe('publicEvent/{slug}', () => {
  beforeEach(async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(doc(ctx.firestore(), `publicEvent/lila-2025`), {
        orgId: ORG_A,
        eventId: 'lila-2025',
        name: 'lila. queer festival 2025',
      })
    })
  })

  it('anon can read', async () => {
    const db = actingAsAnon(env)
    await assertSucceeds(getDoc(doc(db, `publicEvent/lila-2025`)))
  })

  it('authenticated client cannot create', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(setDoc(doc(db, `publicEvent/new-slug`), { orgId: ORG_A, eventId: 'lila-2025', name: 'x' }))
  })

  it('authenticated client cannot update', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertFails(updateDoc(doc(db, `publicEvent/lila-2025`), { name: 'modified' }))
  })
})
