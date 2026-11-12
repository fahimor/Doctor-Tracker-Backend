export const ROLES = ['admin', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** What we know about the caller after the JWT is verified. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
