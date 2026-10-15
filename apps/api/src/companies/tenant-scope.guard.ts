import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { SessionUser } from '../common/auth/session';
import { CompaniesRepository } from './companies.repository';

const uuid = z.uuid();

/**
 * Global: toda ruta con `:companyId` o `:groupId` exige que la empresa o el grupo sean de la sesión.
 * El superadmin pasa si existen. Responde 404 (no 403) para no revelar que existen.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly companies: CompaniesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    const { companyId, groupId } = request.params ?? {};
    if (companyId === undefined && groupId === undefined) return true;

    const { user } = request;
    if (!user || user.kind !== 'staff') throw new NotFoundException();

    if (companyId !== undefined) {
      const id = uuid.safeParse(companyId);
      const allowed =
        id.success &&
        (user.role === 'superadmin'
          ? await this.companies.exists(id.data)
          : user.companyIds.includes(id.data));
      if (!allowed) throw new NotFoundException();
    }
    if (groupId !== undefined) {
      const id = uuid.safeParse(groupId);
      const allowed =
        id.success &&
        (user.role === 'superadmin'
          ? await this.companies.groupExists(id.data)
          : user.groupId === id.data);
      if (!allowed) throw new NotFoundException();
    }
    return true;
  }
}
