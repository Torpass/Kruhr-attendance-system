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
 * Global: toda ruta con `:companyId` exige que la empresa esté entre las de la sesión.
 * Responde 404 (no 403) para no revelar que la empresa existe.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private readonly companies: CompaniesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    const param = request.params?.companyId;
    if (param === undefined) return true;

    const { user } = request;
    const parsed = uuid.safeParse(param);
    if (!user || user.kind !== 'staff' || !parsed.success) {
      throw new NotFoundException();
    }
    const companyId = parsed.data;
    const allowed =
      user.role === 'superadmin'
        ? await this.companies.exists(companyId)
        : user.companyIds.includes(companyId);
    if (!allowed) throw new NotFoundException();
    return true;
  }
}
