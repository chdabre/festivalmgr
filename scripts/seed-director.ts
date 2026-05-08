// scripts/seed-director.ts
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

type Args = {
  orgId: string
  orgName: string
  orgSlug: string
  email: string
  displayName: string
}

export async function seedDirector(args: Args) {
  if (!getApps().length) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    initializeApp(credPath ? { credential: cert(credPath) } : {})
  }
  const auth = getAuth()
  const db = getFirestore()

  let user
  try {
    user = await auth.getUserByEmail(args.email)
  }
  catch {
    user = await auth.createUser({
      email: args.email,
      displayName: args.displayName,
      emailVerified: true,
    })
  }

  await db.doc(`organizations/${args.orgId}`).set({
    name: args.orgName,
    slug: args.orgSlug,
    defaultLocale: 'en',
    defaultCurrency: 'CHF',
    enabledModules: ['artists', 'budget', 'booking', 'riders', 'schedule'],
    createdAt: FieldValue.serverTimestamp(),
  })

  await db.doc(`organizations/${args.orgId}/memberships/${user.uid}`).set({
    userId: user.uid,
    email: args.email.toLowerCase(),
    role: 'director',
    invitedBy: user.uid,
    invitedAt: FieldValue.serverTimestamp(),
    acceptedAt: FieldValue.serverTimestamp(),
    status: 'active',
  })

  await db.doc(`users/${user.uid}`).set({
    email: args.email.toLowerCase(),
    displayName: args.displayName,
    orgIds: [args.orgId],
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await auth.setCustomUserClaims(user.uid, {
    orgId: args.orgId,
    role: 'director',
    orgs: { [args.orgId]: 'director' },
  })

  return { uid: user.uid }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [orgId, orgName, orgSlug, email, displayName] = process.argv.slice(2)
  if (!orgId || !email) {
    console.error('Usage: tsx scripts/seed-director.ts <orgId> <orgName> <orgSlug> <email> <displayName>')
    process.exit(1)
  }
  seedDirector({ orgId, orgName, orgSlug, email, displayName: displayName ?? email })
    .then(({ uid }) => console.log(`Seeded director ${email} (${uid}) into org ${orgId}.`))
    .catch((e) => { console.error(e); process.exit(1) })
}
