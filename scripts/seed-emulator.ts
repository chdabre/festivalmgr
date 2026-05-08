// scripts/seed-emulator.ts
import { seedDirector } from './seed-director'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.GCLOUD_PROJECT = 'festivalmgr-dev'

async function main() {
  const { uid } = await seedDirector({
    orgId: 'lila',
    orgName: 'lila. queer festival e.V.',
    orgSlug: 'lila',
    email: 'director@example.com',
    displayName: 'Lila Director',
  })

  const db = getFirestore()
  const eventRef = db.collection('organizations/lila/events').doc('lila-2025')
  await eventRef.set({
    name: 'lila. queer festival 2025',
    slug: 'lila-2025',
    primaryLocale: 'en',
    primaryContacts: [uid],
    status: 'planning',
    dates: {
      start: Timestamp.fromDate(new Date('2025-09-12')),
      end:   Timestamp.fromDate(new Date('2025-09-14')),
    },
    publishToPublic: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  })

  await eventRef.collection('locations').doc('aktionshalle')
    .set({ name: 'Aktionshalle', capacity: 600, order: 1 })
  await eventRef.collection('locations').doc('clubraum')
    .set({ name: 'Clubraum', capacity: 250, order: 2 })

  console.log('Seeded emulator: org=lila, director=director@example.com, event=lila-2025, 2 locations.')
}

main().catch((e) => { console.error(e); process.exit(1) })
