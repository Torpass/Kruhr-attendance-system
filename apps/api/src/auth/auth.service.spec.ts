import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { SessionUser } from '../common/auth/session';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { hashSecret } from './password';

const STAFF_ID = '0b7f6a3e-7c1d-4b8e-9a51-2f4c6d8e0a11';
const EMPLOYEE_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f022';

const staff: SessionUser = {
  kind: 'staff',
  id: STAFF_ID,
  role: 'admin',
  name: 'Admin A',
  email: 'admin@empresa-a.test',
  groupId: 'g-a',
  companyIds: ['c-norte', 'c-sur'],
};
const employee: SessionUser = {
  kind: 'employee',
  id: EMPLOYEE_ID,
  role: 'employee',
  name: 'Ana Pérez',
  cedula: '12345678',
  companyName: 'A Norte',
  groupId: 'g-a',
  companyIds: ['c-norte'],
};

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let repo: jest.Mocked<AuthRepository>;
  let passwordHash: string;
  let pinHash: string;
  let otherPinHash: string;

  beforeAll(async () => {
    [passwordHash, pinHash, otherPinHash] = await Promise.all([
      hashSecret('clave-segura'),
      hashSecret('4321'),
      hashSecret('9999'),
    ]);
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthRepository,
          useValue: {
            findStaffCredentials: jest.fn(),
            findEmployeeCredentials: jest.fn(),
            findStaffSession: jest.fn(),
            findEmployeeSession: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'x'.repeat(32) }),
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    repo = moduleRef.get(AuthRepository);
  });

  describe('loginStaff', () => {
    it('emite un token con solo la identidad y devuelve la sesión', async () => {
      repo.findStaffCredentials.mockResolvedValue({
        id: STAFF_ID,
        passwordHash,
      });
      repo.findStaffSession.mockResolvedValue(staff);

      const { user, token } = await service.loginStaff({
        email: staff.email,
        password: 'clave-segura',
      });

      expect(user).toEqual(staff);
      const payload = await jwt.verifyAsync<Record<string, unknown>>(token);
      expect(payload).toMatchObject({ sub: STAFF_ID, kind: 'staff' });
      expect(payload).not.toHaveProperty('role');
    });

    it('rechaza una contraseña incorrecta', async () => {
      repo.findStaffCredentials.mockResolvedValue({
        id: STAFF_ID,
        passwordHash,
      });
      await expect(
        service.loginStaff({ email: staff.email, password: 'otra' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un correo que no existe o está inactivo', async () => {
      repo.findStaffCredentials.mockResolvedValue(undefined);
      await expect(
        service.loginStaff({
          email: 'nadie@x.test',
          password: 'clave-segura',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('loginEmployee', () => {
    const NORTE = {
      id: '7a1c2e3d-0000-4000-8000-000000000001',
      name: 'A Norte',
    };
    const SUR = { id: '7a1c2e3d-0000-4000-8000-000000000002', name: 'A Sur' };
    const SUR_EMPLOYEE_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f099';
    const input = { cedula: '12345678', pin: '4321' };

    it('con una sola empresa abre la sesión directamente', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, pinHash, company: NORTE },
      ]);
      repo.findEmployeeSession.mockResolvedValue(employee);

      const result = await service.loginEmployee(input);

      expect(repo.findEmployeeCredentials.mock.calls).toEqual([['12345678']]);
      expect(result).toMatchObject({ user: employee });
      const { token } = result as { token: string };
      await expect(jwt.verifyAsync(token)).resolves.toMatchObject({
        sub: EMPLOYEE_ID,
        kind: 'employee',
      });
    });

    it('con varias empresas devuelve las opciones sin abrir sesión', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, pinHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, pinHash, company: SUR },
      ]);

      await expect(service.loginEmployee(input)).resolves.toEqual({
        companies: [NORTE, SUR],
      });
      expect(repo.findEmployeeSession.mock.calls).toHaveLength(0);
    });

    it('entra en la empresa elegida', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, pinHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, pinHash, company: SUR },
      ]);
      repo.findEmployeeSession.mockResolvedValue(employee);

      await service.loginEmployee({ ...input, companyId: SUR.id });

      expect(repo.findEmployeeSession.mock.calls).toEqual([[SUR_EMPLOYEE_ID]]);
    });

    it('solo ofrece las empresas donde el PIN coincide', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, pinHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, pinHash: otherPinHash, company: SUR },
      ]);
      repo.findEmployeeSession.mockResolvedValue(employee);

      await expect(service.loginEmployee(input)).resolves.toMatchObject({
        user: employee,
      });
    });

    it('rechaza una empresa elegida donde no trabaja', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, pinHash, company: NORTE },
      ]);
      await expect(
        service.loginEmployee({ ...input, companyId: SUR.id }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each([
      [
        'un PIN incorrecto',
        () => [{ id: EMPLOYEE_ID, pinHash, company: NORTE }],
      ],
      ['una cédula sin registros', () => []],
    ])('rechaza %s', async (_caso, accounts) => {
      repo.findEmployeeCredentials.mockResolvedValue(accounts());
      await expect(
        service.loginEmployee({ ...input, pin: '0000' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('resolveSession consulta la tabla según el tipo de token', async () => {
    repo.findEmployeeSession.mockResolvedValue(employee);
    await expect(
      service.resolveSession({ sub: EMPLOYEE_ID, kind: 'employee' }),
    ).resolves.toEqual(employee);
    expect(repo.findStaffSession.mock.calls).toHaveLength(0);
  });
});
