import { z } from 'zod';

export const SESSION_COOKIE = 'marcaje_session';

export const ROLES = ['superadmin', 'admin', 'analyst', 'employee'] as const;
export type Role = (typeof ROLES)[number];
export type StaffRole = Exclude<Role, 'employee'>;

/**
 * Lo único que va firmado en la cookie: quién es y por qué puerta entró.
 * Rol, estado y empresas se leen de la base en cada request, así que desactivar
 * a alguien o cambiar sus empresas tiene efecto inmediato.
 */
export const sessionTokenSchema = z.object({
  sub: z.uuid(),
  kind: z.enum(['staff', 'employee']),
});
export type SessionToken = z.infer<typeof sessionTokenSchema>;

/** Usuario autenticado de la request. `companyIds` vacío en el superadmin: accede a todas. */
export type SessionUser =
  | {
      kind: 'staff';
      id: string;
      role: StaffRole;
      name: string;
      email: string;
      groupId: string | null;
      companyIds: string[];
    }
  | {
      kind: 'employee';
      id: string;
      role: 'employee';
      name: string;
      cedula: string;
      /** Empresa en la que marca: la que eligió al entrar. */
      companyName: string;
      groupId: string;
      companyIds: [string];
    };
