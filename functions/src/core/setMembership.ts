import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { assertCallerHasRoleInOrg, type Role } from './helpers'

if (!getApps().length) initializeApp()

type Data = { orgId: string; email: string; role: Role }

export const setMembership = onCall<Data>(async (req) => {
  const { orgId, email, role } = req.data ?? ({} as Data)
  if (!orgId || !email || !role) {
    throw new HttpsError('invalid-argument', 'orgId, email and role are required.')
  }
  assertCallerHasRoleInOrg(req, orgId, ['director'])

  const db = getFirestore()
  const ref = db.collection(`organizations/${orgId}/memberships`).doc()
  await ref.set({
    userId: null,
    email: email.trim().toLowerCase(),
    role,
    invitedBy: req.auth!.uid,
    invitedAt: FieldValue.serverTimestamp(),
    acceptedAt: null,
    status: 'pending',
  })
  return { membershipId: ref.id }
})
