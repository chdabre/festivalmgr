#!/usr/bin/env node
const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400'
const REQUIRED = (process.env.FIREBASE_EMULATORS_REQUIRED || 'auth,firestore,functions,storage')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const TIMEOUT_MS = Number(process.env.FIREBASE_EMULATOR_WAIT_TIMEOUT_MS) || 120_000

const started = Date.now()
let lastMissing = ''

while (Date.now() - started < TIMEOUT_MS) {
  try {
    const res = await fetch(`http://${HUB}/emulators`)
    if (res.ok) {
      const json = await res.json()
      const missing = REQUIRED.filter((s) => !json[s])
      if (missing.length === 0) {
        console.log(`[wait-for-emulators] hub reports: ${REQUIRED.join(', ')}`)
        process.exit(0)
      }
      const m = missing.join(',')
      if (m !== lastMissing) {
        console.log(`[wait-for-emulators] still waiting for: ${m}`)
        lastMissing = m
      }
    }
  } catch {
    // Hub not up yet — keep polling.
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.error(`[wait-for-emulators] timed out after ${TIMEOUT_MS}ms; missing: ${lastMissing || REQUIRED.join(',')}`)
process.exit(1)
