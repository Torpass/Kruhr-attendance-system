import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<Request & { user: SessionUser }>().user,
);
