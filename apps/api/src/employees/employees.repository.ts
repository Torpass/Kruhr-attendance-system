import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { employees } from '../database/schema';

/** Columnas públicas: el hash de la contraseña nunca sale del repositorio. */
const publicColumns = {
  id: employees.id,
  companyId: employees.companyId,
  cedula: employees.cedula,
  name: employees.name,
  active: employees.active,
  hiredOn: employees.hiredOn,
  createdAt: employees.createdAt,
};

export interface Employee {
  id: string;
  companyId: string;
  cedula: string;
  name: string;
  active: boolean;
  hiredOn: string | null;
  createdAt: Date;
}

@Injectable()
export class EmployeesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(companyId: string, { onlyActive = false } = {}): Promise<Employee[]> {
    return this.db
      .select(publicColumns)
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          onlyActive ? eq(employees.active, true) : undefined,
        ),
      )
      .orderBy(asc(employees.name));
  }

  async find(companyId: string, id: string): Promise<Employee | undefined> {
    const [row] = await this.db
      .select(publicColumns)
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.id, id)));
    return row;
  }

  async create(values: typeof employees.$inferInsert): Promise<Employee> {
    const [row] = await this.db
      .insert(employees)
      .values(values)
      .returning(publicColumns);
    return row;
  }

  async update(
    companyId: string,
    id: string,
    changes: Partial<
      Pick<
        typeof employees.$inferInsert,
        'name' | 'passwordHash' | 'active' | 'hiredOn'
      >
    >,
  ): Promise<Employee | undefined> {
    const [row] = await this.db
      .update(employees)
      .set(changes)
      .where(and(eq(employees.companyId, companyId), eq(employees.id, id)))
      .returning(publicColumns);
    return row;
  }
}
