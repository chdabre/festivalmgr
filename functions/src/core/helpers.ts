// functions/src/core/helpers.ts
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

export function assertSignedIn(req: CallableRequest): asserts req is CallableRequest & { auth: NonNullable<CallableRequest['auth']> } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
}

export function assertCallerHasRoleInOrg(
  req: CallableRequest,
  orgId: string,
  allowedRoles: Role[],
): void {
  assertSignedIn(req)
  const claims = req.auth.token as { orgId?: string; role?: Role }
  if (claims.orgId !== orgId || !claims.role || !allowedRoles.includes(claims.role)) {
    throw new HttpsError('permission-denied', `Required role(s): ${allowedRoles.join(', ')}.`)
  }
}
