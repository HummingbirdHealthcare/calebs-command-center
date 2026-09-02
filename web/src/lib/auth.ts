export interface AuthUser {
  userId: string
  userDetails: string
  userRoles: string[]
}

/** Azure Static Web Apps' built-in endpoint for the signed-in user — always
 *  available client-side regardless of what the API allows them to do. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/.auth/me')
    if (!res.ok) return null
    const data = await res.json()
    return data?.clientPrincipal ?? null
  } catch {
    return null
  }
}
