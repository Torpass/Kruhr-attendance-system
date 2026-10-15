import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SessionToken, SessionUser } from '../common/auth/session';
import { AuthRepository } from './auth.repository';
import type { EmployeeLoginInput, StaffLoginInput } from './auth.schemas';
import { verifySecret } from './password';

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

  /** Colaborador: empresa, cédula y PIN. */
  async loginEmployee({ company, cedula, pin }: EmployeeLoginInput) {
    const account = await this.repo.findEmployeeCredentials(company, cedula);
    const valid = await verifySecret(account?.pinHash, pin);
    if (!account || !valid) {
      throw new UnauthorizedException('Empresa, cédula o PIN incorrectos');
    }
    return this.openSession({ sub: account.id, kind: 'employee' });
  }

  /** Carga el usuario vigente de un token. `undefined` si ya no existe o está inactivo. */
  resolveSession(token: SessionToken): Promise<SessionUser | undefined> {
    return token.kind === 'staff'
      ? this.repo.findStaffSession(token.sub)
      : this.repo.findEmployeeSession(token.sub);
  }

  private async openSession(token: SessionToken) {
    const user = await this.resolveSession(token);
    if (!user) throw new UnauthorizedException();
    return { user, token: await this.jwt.signAsync(token) };
  }
}
