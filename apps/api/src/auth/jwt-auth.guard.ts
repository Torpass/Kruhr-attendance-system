import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/auth/public.decorator';
import {
  SESSION_COOKIE,
  sessionTokenSchema,
  type SessionUser,
} from '../common/auth/session';
import { AuthService } from './auth.service';

/** Global: toda ruta exige una sesión vigente salvo las marcadas con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: SessionUser }>();
    const cookie = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    if (!cookie) throw new UnauthorizedException();

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(cookie);
    } catch {
      throw new UnauthorizedException();
    }
    // Rechaza tokens con otra forma (p. ej., los del login provisional).
    const token = sessionTokenSchema.safeParse(payload);
    if (!token.success) throw new UnauthorizedException();

    const user = await this.auth.resolveSession(token.data);
    if (!user) throw new UnauthorizedException();

    request.user = user;
    return true;
  }
}
