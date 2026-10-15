import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env';
import type { SessionUser } from '../common/auth/session';
import type { LoginInput } from './auth.schemas';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Login provisional contra un único usuario definido por variables de entorno.
   * Se reemplaza por la tabla `users` (argon2) cuando se definan los casos de uso.
   */
  async login({ email, password }: LoginInput) {
    const demoEmail = this.config.get('DEMO_EMAIL', { infer: true });
    const demoPassword = this.config.get('DEMO_PASSWORD', { infer: true });

    const emailOk = timingSafeEqual(digest(email), digest(demoEmail));
    const passwordOk = timingSafeEqual(digest(password), digest(demoPassword));
    if (!emailOk || !passwordOk) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const user: SessionUser = {
      sub: 'demo',
      email: demoEmail,
      name: 'Usuario demo',
      role: 'superadmin',
    };
    const token = await this.jwt.signAsync({ ...user });
    return { user, token };
  }
}
