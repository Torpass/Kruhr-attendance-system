import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;

  beforeEach(async () => {
    const env: Record<string, string> = {
      DEMO_EMAIL: 'demo@marcaje.test',
      DEMO_PASSWORD: 'clave-segura',
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'x'.repeat(32) }),
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
  });

  it('emite un token con el usuario de sesión cuando las credenciales coinciden', async () => {
    const { user, token } = await service.login({
      email: 'demo@marcaje.test',
      password: 'clave-segura',
    });

    expect(user).toMatchObject({
      email: 'demo@marcaje.test',
      role: 'superadmin',
    });
    await expect(jwt.verifyAsync(token)).resolves.toMatchObject({
      sub: 'demo',
    });
  });

  it.each([
    ['contraseña incorrecta', 'demo@marcaje.test', 'otra'],
    ['correo incorrecto', 'otro@marcaje.test', 'clave-segura'],
  ])('rechaza %s', async (_caso, email, password) => {
    await expect(service.login({ email, password })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
