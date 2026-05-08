import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { assertCallerHasRoleInOrg } from './helpers'

if (!getApps().length) initializeApp()

type Data = { orgId: string; membershipId: string }

export const revokeMembership = onCall<Data>(async (req) => {
  const { orgId, membershipId } = req.data ?? ({} as Data)
  if (!orgId || !membershipId) {
    throw new HttpsError('invalid-argument', 'orgId and membershipId are required.')
  }
  assertCallerHasRoleInOrg(req, orgId, ['director'])

  const db = getFirestore()
  const ref = db.doc(`organizations/${orgId}/memberships/${membershipId}`)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Membership not found.')
  }
  const m = snap.data() as { userId: string | null; status: string }

  await ref.update({
    status: 'revoked',
    revokedAt: FieldValue.serverTimestamp(),
  })
  if (m.userId && m.status === 'active') {
    await getAuth().setCustomUserClaims(m.userId, null)
  }
  return { ok: true as const }
})
