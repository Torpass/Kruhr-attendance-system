import {
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
   * Colaborador: cédula y PIN. Si el PIN coincide en varias empresas y no eligió una,
   * devuelve las opciones sin abrir sesión. Las empresas solo se revelan con el PIN correcto.
   */
  async loginEmployee({
    cedula,
    pin,
    companyId,
  }: EmployeeLoginInput): Promise<EmployeeLoginResult> {
    const accounts = await this.repo.findEmployeeCredentials(cedula);
    const checks = await Promise.all(
      accounts.length > 0
        ? accounts.map((account) => verifySecret(account.pinHash, pin))
        : [verifySecret(undefined, pin)],
    );
    const matches = accounts.filter((_, index) => checks[index]);

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
    throw new UnauthorizedException('Cédula o PIN incorrectos');
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

  private async openSession(token: SessionToken): Promise<OpenedSession> {
    const user = await this.resolveSession(token);
    if (!user) throw new UnauthorizedException();
    return { user, token: await this.jwt.signAsync(token) };
  }
}
