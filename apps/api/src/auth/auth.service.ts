import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SessionToken, SessionUser } from '../common/auth/session';
import { AuthRepository } from './auth.repository';
import { rethrowSlugConflict } from '../companies/companies.repository';
import { pgError, PG_UNIQUE_VIOLATION } from '../database/pg-error';
import type {
  ChangePasswordInput,
  EmployeeLoginInput,
  RegisterInput,
  StaffLoginInput,
} from './auth.schemas';
import { hashSecret, verifySecret } from './password';

export interface OpenedSession {
  user: SessionUser;
  token: string;
}

/** Sesión abierta, o empresas entre las que el colaborador debe elegir. */
export type EmployeeLoginResult =
  OpenedSession | { companies: { id: string; name: string }[] };

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  /** Admin, analista o superadmin: correo y contraseña. */
  async loginStaff({ email, password }: StaffLoginInput) {
    const account = await this.repo.findStaffCredentials(email);
    // Se verifica siempre (con un hash de relleno si no existe) para no revelar qué correos existen.
    const valid = await verifySecret(account?.passwordHash, password);
    if (!account || !valid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    return this.openSession({ sub: account.id, kind: 'staff' });
  }

  /**
   * Colaborador: cédula y contraseña. Si coincide en varias empresas y no eligió una,
   * devuelve las opciones sin abrir sesión. Las empresas solo se revelan con la contraseña correcta.
   */
  async loginEmployee({
    cedula,
    password,
    companyId,
  }: EmployeeLoginInput): Promise<EmployeeLoginResult> {
    const matches = await this.employeeAccountsMatching(cedula, password);

    const chosen = companyId
      ? matches.find((account) => account.company.id === companyId)
      : matches.length === 1
        ? matches[0]
        : undefined;

    if (chosen) {
      return this.openSession({ sub: chosen.id, kind: 'employee' });
    }
    if (matches.length > 1 && !companyId) {
      return { companies: matches.map((account) => account.company) };
    }
    throw new UnauthorizedException('Cédula o contraseña incorrectas');
  }

  /**
   * El colaborador cambia su contraseña. Se actualiza en todas las empresas donde
   * la actual coincide, para que el login le siga ofreciendo las mismas empresas.
   */
  async changeEmployeePassword(
    { id, cedula }: { id: string; cedula: string },
    { currentPassword, newPassword }: ChangePasswordInput,
  ) {
    const matches = await this.employeeAccountsMatching(
      cedula,
      currentPassword,
    );
    if (!matches.some((account) => account.id === id)) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    await this.repo.setEmployeePasswordHash(
      matches.map((account) => account.id),
      await hashSecret(newPassword),
    );
  }

  /** Una empresa se registra: grupo, primera empresa y su admin, con la sesión ya abierta. */
  async register({
    companyName,
    companyCode,
    name,
    email,
    password,
  }: RegisterInput) {
    let adminId: string;
    try {
      adminId = await this.repo.registerCompany({
        companyName,
        slug: companyCode,
        adminName: name,
        email,
        passwordHash: await hashSecret(password),
      });
    } catch (error) {
      const pg = pgError(error);
      if (
        pg?.code === PG_UNIQUE_VIOLATION &&
        pg.constraint_name === 'users_email_unique'
      ) {
        throw new ConflictException('Ese correo ya está registrado');
      }
      rethrowSlugConflict(error);
    }
    return this.openSession({ sub: adminId, kind: 'staff' });
  }

  /** Carga el usuario vigente de un token. `undefined` si ya no existe o está inactivo. */
  resolveSession(token: SessionToken): Promise<SessionUser | undefined> {
    return token.kind === 'staff'
      ? this.repo.findStaffSession(token.sub)
      : this.repo.findEmployeeSession(token.sub);
  }

  /** Registros de la cédula cuya contraseña coincide. Sin registros, igual verifica (tiempo constante). */
  private async employeeAccountsMatching(cedula: string, password: string) {
    const accounts = await this.repo.findEmployeeCredentials(cedula);
    const checks = await Promise.all(
      accounts.length > 0
        ? accounts.map((account) =>
            verifySecret(account.passwordHash, password),
          )
        : [verifySecret(undefined, password)],
    );
    return accounts.filter((_, index) => checks[index]);
  }

  private async openSession(token: SessionToken): Promise<OpenedSession> {
    const user = await this.resolveSession(token);
    if (!user) throw new UnauthorizedException();
    return { user, token: await this.jwt.signAsync(token) };
  }
}
