import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) initializeApp()

export const claimMembership = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
  const uid = req.auth.uid
  const email = String(req.auth.token.email ?? '').toLowerCase()
  if (!email) {
    return { activatedOrgIds: [] as string[] }
  }

  const db = getFirestore()
  const snap = await db
    .collectionGroup('memberships')
    .where('email', '==', email)
    .where('status', '==', 'pending')
    .get()

  const activatedOrgIds: string[] = []
  let primary: { orgId: string; role: string } | null = null

  for (const doc of snap.docs) {
    const orgId = doc.ref.parent.parent!.id
    const role = (doc.data() as { role: string }).role
    await doc.ref.update({
      userId: uid,
      status: 'active',
      acceptedAt: FieldValue.serverTimestamp(),
    })
    activatedOrgIds.push(orgId)
    if (!primary) primary = { orgId, role }
  }

  if (primary) {
    await getAuth().setCustomUserClaims(uid, {
      orgId: primary.orgId,
      role: primary.role,
      orgs: Object.fromEntries(activatedOrgIds.map((o, i) => [o, i === 0 ? primary!.role : 'crew'])),
    })

    const userRef = db.doc(`users/${uid}`)
    const u = await userRef.get()
    if (u.exists) {
      await userRef.update({ orgIds: FieldValue.arrayUnion(...activatedOrgIds) })
    }
    else {
      await userRef.set({
        email,
        displayName: req.auth.token.name ?? email,
        photoURL: req.auth.token.picture ?? null,
        orgIds: activatedOrgIds,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }

  return { activatedOrgIds }
})
