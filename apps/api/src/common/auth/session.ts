export const SESSION_COOKIE = 'marcaje_session';

export const ROLES = ['superadmin', 'admin', 'analyst', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
}
