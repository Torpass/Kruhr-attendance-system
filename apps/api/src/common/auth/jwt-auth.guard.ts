import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_COOKIE, type SessionUser } from './session';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
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
    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    if (!token) throw new UnauthorizedException();

    try {
      request.user = await this.jwt.verifyAsync<SessionUser>(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
