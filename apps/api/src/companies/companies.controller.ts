import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { CompaniesRepository } from './companies.repository';

@Roles('admin', 'analyst')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesRepository) {}

  /** Empresas que la sesión puede gestionar (selector de empresa en RRHH). */
  @Get()
  async list(@CurrentUser() user: SessionUser) {
    const companies = await this.companies.list(
      user.role === 'superadmin' ? undefined : user.companyIds,
    );
    return { companies };
  }
}
