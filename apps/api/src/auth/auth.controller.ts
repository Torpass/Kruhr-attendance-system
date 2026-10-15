import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, type ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { SESSION_COOKIE, type SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  employeeLoginSchema,
  staffLoginSchema,
  type EmployeeLoginInput,
  type StaffLoginInput,
} from './auth.schemas';
import { AuthService } from './auth.service';

// Límite por cuenta además del límite por IP: frena la fuerza bruta de un PIN desde muchas IPs.
// El de IP es holgado porque un turno completo puede entrar a la vez desde el Wi-Fi de la empresa.
const accountTracker =
  (...fields: string[]): ThrottlerGetTrackerFunction =>
  (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return fields
      .map((field) => {
        const value = body[field];
        return typeof value === 'string' ? value.trim().toLowerCase() : '';
      })
      .join(':');
  };
const loginThrottle = (...accountFields: string[]) =>
  Throttle({
    default: { limit: 30, ttl: 60_000 },
    account: {
      limit: 5,
      ttl: 60_000,
      getTracker: accountTracker(...accountFields),
    },
  });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @loginThrottle('email')
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  async loginStaff(
    @Body(new ZodValidationPipe(staffLoginSchema)) body: StaffLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.loginStaff(body));
  }

  @Public()
  @loginThrottle('company', 'cedula')
  @Post('employee/login')
  @HttpCode(HttpStatus.OK)
  async loginEmployee(
    @Body(new ZodValidationPipe(employeeLoginSchema)) body: EmployeeLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.loginEmployee(body));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }

  private startSession(
    res: Response,
    { user, token }: { user: SessionUser; token: string },
  ) {
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }) * 1000,
    });
    return { user };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
}
