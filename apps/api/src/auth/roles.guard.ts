import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import type { Role, SessionUser } from '../common/auth/session';

/** Global, después de JwtAuthGuard: aplica @Roles() de la ruta o del controlador. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    if (!user) return false;

    const allowed =
      roles.includes(user.role) ||
      (user.role === 'superadmin' && roles.some((role) => role !== 'employee'));
    if (!allowed) throw new ForbiddenException();
    return true;
  }
}
