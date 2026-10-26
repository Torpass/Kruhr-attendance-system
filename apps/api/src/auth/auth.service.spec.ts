import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { SessionUser } from '../common/auth/session';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { hashSecret, verifySecret } from './password';

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
  let employeeHash: string;
  let otherPasswordHash: string;

  beforeAll(async () => {
    [passwordHash, employeeHash, otherPasswordHash] = await Promise.all([
      hashSecret('clave-segura'),
      hashSecret('clave-de-ana'),
      hashSecret('otra-clave'),
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
            setEmployeePasswordHash: jest.fn(),
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
    const input = { cedula: '12345678', password: 'clave-de-ana' };

    it('con una sola empresa abre la sesión directamente', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE },
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
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, passwordHash: employeeHash, company: SUR },
      ]);

      await expect(service.loginEmployee(input)).resolves.toEqual({
        companies: [NORTE, SUR],
      });
      expect(repo.findEmployeeSession.mock.calls).toHaveLength(0);
    });

    it('entra en la empresa elegida', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, passwordHash: employeeHash, company: SUR },
      ]);
      repo.findEmployeeSession.mockResolvedValue(employee);

      await service.loginEmployee({ ...input, companyId: SUR.id });

      expect(repo.findEmployeeSession.mock.calls).toEqual([[SUR_EMPLOYEE_ID]]);
    });

    it('solo ofrece las empresas donde la contraseña coincide', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE },
        { id: SUR_EMPLOYEE_ID, passwordHash: otherPasswordHash, company: SUR },
      ]);
      repo.findEmployeeSession.mockResolvedValue(employee);

      await expect(service.loginEmployee(input)).resolves.toMatchObject({
        user: employee,
      });
    });

    it('rechaza una empresa elegida donde no trabaja', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE },
      ]);
      await expect(
        service.loginEmployee({ ...input, companyId: SUR.id }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each([
      [
        'una contraseña incorrecta',
        () => [{ id: EMPLOYEE_ID, passwordHash: employeeHash, company: NORTE }],
      ],
      ['una cédula sin registros', () => []],
    ])('rechaza %s', async (_caso, accounts) => {
      repo.findEmployeeCredentials.mockResolvedValue(accounts());
      await expect(
        service.loginEmployee({ ...input, password: 'equivocada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changeEmployeePassword', () => {
    const SUR_EMPLOYEE_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f099';
    const OTRA_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f0aa';
    const company = { id: 'c', name: 'C' };
    const ana = { id: EMPLOYEE_ID, cedula: '12345678' };
    const input = {
      currentPassword: 'clave-de-ana',
      newPassword: 'clave-nueva-de-ana',
    };

    it('la cambia en todas las empresas donde la actual coincide', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: employeeHash, company },
        { id: SUR_EMPLOYEE_ID, passwordHash: employeeHash, company },
        { id: OTRA_ID, passwordHash: otherPasswordHash, company },
      ]);

      await service.changeEmployeePassword(ana, input);

      const [[ids, hash]] = repo.setEmployeePasswordHash.mock.calls;
      expect(ids).toEqual([EMPLOYEE_ID, SUR_EMPLOYEE_ID]);
      await expect(verifySecret(hash, input.newPassword)).resolves.toBe(true);
    });

    it('rechaza una contraseña actual incorrecta sin cambiar nada', async () => {
      repo.findEmployeeCredentials.mockResolvedValue([
        { id: EMPLOYEE_ID, passwordHash: otherPasswordHash, company },
        { id: SUR_EMPLOYEE_ID, passwordHash: employeeHash, company },
      ]);

      await expect(
        service.changeEmployeePassword(ana, input),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.setEmployeePasswordHash.mock.calls).toHaveLength(0);
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
