import { SetMetadata } from '@nestjs/common';
import type { Role } from './session';

export const ROLES_KEY = 'roles';

/**
 * Roles que pueden usar la ruta. El superadmin pasa en cualquier ruta de gestión,
 * pero no en las del colaborador (`employee`). Sin @Roles basta con tener sesión.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
