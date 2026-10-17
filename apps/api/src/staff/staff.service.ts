import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashSecret } from '../auth/password';
import type { SessionUser, StaffRole } from '../common/auth/session';
import {
  pgError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '../database/pg-error';
import type { CreateStaffInput, UpdateStaffInput } from './staff.schemas';
import { StaffRepository } from './staff.repository';

type Actor = Extract<SessionUser, { kind: 'staff' }>;

/**
 * Quién gestiona a quién: el superadmin, a admins y analistas de cualquier grupo; el admin, a
 * admins y analistas de su grupo, solo con las empresas que él mismo gestiona. Nadie fuera del
 * superadmin crea o toca superadmins (no es un rol asignable).
 */
function assertCanManage(actor: Actor, role: StaffRole) {
  const allowed =
    actor.role === 'superadmin' ||
    (actor.role === 'admin' && (role === 'admin' || role === 'analyst'));
  if (!allowed) {
    throw new ForbiddenException('No puedes gestionar usuarios con ese rol');
  }
}

/**
 * Un admin no edita a otro admin que gestiona empresas que él no gestiona: desactivarlo o
 * cambiarle el rol o la clave afectaría a esas empresas.
 */
function assertAdminInScope(
  actor: Actor,
  target: { role: StaffRole; companyIds: string[] },
) {
  if (actor.role === 'superadmin' || target.role !== 'admin') return;
  if (target.companyIds.some((id) => !actor.companyIds.includes(id))) {
    throw new ForbiddenException(
      'Ese administrador gestiona empresas que tú no gestionas',
    );
  }
}

function assertCompaniesInScope(actor: Actor, companyIds: string[]) {
  if (actor.role === 'superadmin') return;
  if (companyIds.some((id) => !actor.companyIds.includes(id))) {
    throw new ForbiddenException('Solo puedes asignar empresas que gestionas');
  }
}

function translateWriteError(error: unknown): never {
  const code = pgError(error)?.code;
  if (code === PG_UNIQUE_VIOLATION) {
    throw new ConflictException('Ese correo ya está registrado');
  }
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    throw new BadRequestException('Alguna empresa no pertenece al grupo');
  }
  throw error;
}

@Injectable()
export class StaffService {
  constructor(private readonly staff: StaffRepository) {}

  list(groupId: string) {
    return this.staff.list(groupId);
  }

  async create(actor: Actor, groupId: string, input: CreateStaffInput) {
    assertCanManage(actor, input.role);
    assertCompaniesInScope(actor, input.companyIds);
    const { password, companyIds, ...values } = input;
    const id = await this.staff
      .create(
        groupId,
        { ...values, passwordHash: await hashSecret(password) },
        companyIds,
      )
      .catch(translateWriteError);
    return this.staff.find(groupId, id);
  }

  async update(
    actor: Actor,
    groupId: string,
    id: string,
    input: UpdateStaffInput,
  ) {
    const target = await this.staff.find(groupId, id);
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (target.role === 'superadmin')
      throw new NotFoundException('Usuario no encontrado');
    if (
      target.id === actor.id &&
      (input.role !== undefined || input.active !== undefined)
    ) {
      throw new BadRequestException(
        'No puedes cambiar tu propio rol ni desactivarte',
      );
    }
    assertCanManage(actor, target.role);
    if (input.role) assertCanManage(actor, input.role);
    assertAdminInScope(actor, target);

    let companyIds: string[] | undefined;
    if (input.companyIds) {
      assertCompaniesInScope(actor, input.companyIds);
      // El admin solo toca las empresas que gestiona: las demás asignaciones se conservan.
      const untouched =
        actor.role === 'superadmin'
          ? []
          : target.companyIds.filter((cid) => !actor.companyIds.includes(cid));
      companyIds = [...new Set([...untouched, ...input.companyIds])];
    }

    const { name, role, active, password } = input;
    await this.staff
      .update(
        groupId,
        id,
        {
          name,
          role,
          active,
          ...(password && { passwordHash: await hashSecret(password) }),
        },
        companyIds,
      )
      .catch(translateWriteError);
    return this.staff.find(groupId, id);
  }
}
