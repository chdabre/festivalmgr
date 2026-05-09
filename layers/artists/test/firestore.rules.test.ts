import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc, Timestamp,
} from 'firebase/firestore'
import {
  actingAs, actingAsAnon, getEnv, seedAsAdmin, type TestUser,
} from '../../core/test/helpers/rules-env'

let env: RulesTestEnvironment

beforeAll(async () => { env = await getEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const ORG_A = 'lila'
const ORG_B = 'other'
const EVENT_A = 'lila-2025'

const DIRECTOR_A:   TestUser = { uid: 'dirA',  orgId: ORG_A, role: 'director',   orgs: { [ORG_A]: 'director' } }
const BOOKER_A:     TestUser = { uid: 'bokA',  orgId: ORG_A, role: 'booker',     orgs: { [ORG_A]: 'booker' } }
const PROD_A:       TestUser = { uid: 'prdA',  orgId: ORG_A, role: 'production', orgs: { [ORG_A]: 'production' } }
const FIN_A:        TestUser = { uid: 'finA',  orgId: ORG_A, role: 'finance',    orgs: { [ORG_A]: 'finance' } }
const PR_A:         TestUser = { uid: 'prA',   orgId: ORG_A, role: 'pr',         orgs: { [ORG_A]: 'pr' } }
const CREW_A:       TestUser = { uid: 'crwA',  orgId: ORG_A, role: 'crew',       orgs: { [ORG_A]: 'crew' } }
const BOOKER_B:     TestUser = { uid: 'bokB',  orgId: ORG_B, role: 'booker',     orgs: { [ORG_B]: 'booker' } }

function artistFixture(overrides: Record<string, unknown> = {}) {
  return {
    name: 'NewAct',
    category: 'Musikact',
    links: {},
    status: 'planned',
    statusChangedAt: Timestamp.now(),
    checklist: {},
    createdAt: Timestamp.now(),
    createdBy: BOOKER_A.uid,
    updatedAt: Timestamp.now(),
    updatedBy: BOOKER_A.uid,
    deletedAt: null,
    ...overrides,
  }
}

async function seedExistingArtist(orgId: string, eventId: string, artistId: string, overrides: Record<string, unknown> = {}) {
  await seedAsAdmin(env, async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `organizations/${orgId}/events/${eventId}/artists/${artistId}`),
      artistFixture({ name: 'ARXX', status: 'confirmed', ...overrides }),
    )
  })
}

describe('artists/{artistId}', () => {
  beforeEach(async () => {
    await seedExistingArtist(ORG_A, EVENT_A, 'a1')
    await seedExistingArtist(ORG_A, EVENT_A, 'gone', { deletedAt: Timestamp.now() })
    await seedExistingArtist(ORG_B, EVENT_A, 'b1')
  })

  // 1. Booker in lila creates a valid artist — allow
  it('booker creates a valid artist', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertSucceeds(addDoc(ref, artistFixture()))
  })

  // 2. Booker in lila reads/writes an artist in orgB — deny
  it('booker cannot cross-tenant read', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(getDoc(doc(db, `organizations/${ORG_B}/events/${EVENT_A}/artists/b1`)))
  })

  it('booker cannot cross-tenant update', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_B}/events/${EVENT_A}/artists/b1`),
      { name: 'X', updatedAt: Timestamp.now(), updatedBy: BOOKER_A.uid },
    ))
  })

  // 3. Anonymous read — deny
  it('anon read denied', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 4. Crew tries to update — deny
  it('crew cannot update', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { comment: 'x', updatedAt: Timestamp.now(), updatedBy: CREW_A.uid },
    ))
  })

  // 5. Production updates fee — deny
  it('production cannot update fee', async () => {
    const db = actingAs(env, PROD_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { fee: { amount: 1, currency: 'CHF' }, updatedAt: Timestamp.now(), updatedBy: PROD_A.uid },
    ))
  })

  // 6. Production updates intendedDay + checklist — allow
  it('production can update intendedDay and checklist', async () => {
    const db = actingAs(env, PROD_A)
    await assertSucceeds(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      {
        intendedDay: '2025-09-05',
        checklist: { 'tech-rider-received': { done: true } },
        updatedAt: Timestamp.now(),
        updatedBy: PROD_A.uid,
      },
    ))
  })

  // 7. PR updates shortDescription + links — allow
  it('pr can update shortDescription and links', async () => {
    const db = actingAs(env, PR_A)
    await assertSucceeds(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      {
        shortDescription: 'bio',
        links: { website: 'https://example' },
        updatedAt: Timestamp.now(),
        updatedBy: PR_A.uid,
      },
    ))
  })

  // 8. PR updates fee — deny
  it('pr cannot update fee', async () => {
    const db = actingAs(env, PR_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { fee: { amount: 1, currency: 'CHF' }, updatedAt: Timestamp.now(), updatedBy: PR_A.uid },
    ))
  })

  // 9. Director hard-deletes — allow
  it('director can hard delete', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 10. Booker hard-deletes — deny
  it('booker cannot hard delete', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(deleteDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 11. Create with missing/invalid fields — deny
  it('create with empty name denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ name: '' })))
  })

  it('create with invalid status denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ status: 'bogus' })))
  })

  it('create with createdBy != auth.uid denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ createdBy: 'someoneelse' })))
  })

  // 12. Update sets status to invalid value — deny
  it('update with invalid status denied', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { status: 'bogus', updatedAt: Timestamp.now(), updatedBy: BOOKER_A.uid },
    ))
  })

  // 13. Soft-deleted artist read denied
  it('soft-deleted read denied', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/gone`)))
  })

  // Cross-tenant booker covers row 2 deny
  it('cross-tenant booker cannot read other org artists', async () => {
    const db = actingAs(env, BOOKER_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })
})

describe('artists/{artistId}/activity', () => {
  beforeEach(async () => {
    await seedExistingArtist(ORG_A, EVENT_A, 'a1')
  })

  it('member can read activity', async () => {
    const db = actingAs(env, FIN_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/x`)))
  })

  it('member can append activity with their own uid', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity`)
    await assertSucceeds(addDoc(ref, {
      uid: BOOKER_A.uid, at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired',
    }))
  })

  it('member cannot append activity with another uid', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity`)
    await assertFails(addDoc(ref, {
      uid: 'someoneelse', at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired',
    }))
  })

  it('activity entries are immutable', async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
        { uid: BOOKER_A.uid, at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired' },
      )
    })
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
      { field: 'tampered' },
    ))
    await assertFails(deleteDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
    ))
  })
})
