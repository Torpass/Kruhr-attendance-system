import {
  Body,
  Controller,
  ForbiddenException,
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
import { Roles } from '../common/auth/roles.decorator';
import { SESSION_COOKIE, type SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  changePasswordSchema,
  employeeLoginSchema,
  registerSchema,
  staffLoginSchema,
  type ChangePasswordInput,
  type EmployeeLoginInput,
  type RegisterInput,
  type StaffLoginInput,
} from './auth.schemas';
import { AuthService, type OpenedSession } from './auth.service';

// Límite por cuenta además del límite por IP: frena la fuerza bruta de una contraseña desde muchas IPs.
// El de IP es holgado porque un turno completo puede entrar a la vez desde el Wi-Fi de la empresa.
// La clave se normaliza igual que la validación, para que "V-12.345.678" y "12345678" cuenten juntos.
const bodyField =
  (field: string, normalize: (value: string) => string) =>
  (req: Record<string, any>): string => {
    const value = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof value === 'string' ? normalize(value) : '';
  };
const loginThrottle = (getTracker: ThrottlerGetTrackerFunction) =>
  Throttle({
    default: { limit: 30, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000, getTracker },
  });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @loginThrottle(bodyField('email', (v) => v.trim().toLowerCase()))
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  async loginStaff(
    @Body(new ZodValidationPipe(staffLoginSchema)) body: StaffLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.loginStaff(body));
  }

  @Public()
  @loginThrottle(bodyField('cedula', (v) => v.replace(/\D/g, '')))
  @Post('employee/login')
  @HttpCode(HttpStatus.OK)
  async loginEmployee(
    @Body(new ZodValidationPipe(employeeLoginSchema)) body: EmployeeLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginEmployee(body);
    // Trabaja en varias empresas: el cliente muestra las opciones y repite con companyId.
    if ('companies' in result) return result;
    return this.startSession(res, result);
  }

  @Roles('employee')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('employee/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeEmployeePassword(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
  ) {
    // RolesGuard ya lo garantiza; esto solo estrecha el tipo.
    if (user.kind !== 'employee') throw new ForbiddenException();
    await this.auth.changeEmployeePassword(user, body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.register(body));
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

  private startSession(res: Response, { user, token }: OpenedSession) {
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
