import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CompaniesRepository } from './companies.repository';
import {
  createCompanySchema,
  createGroupSchema,
  updateCompanySchema,
  type CreateCompanyInput,
  type CreateGroupInput,
  type UpdateCompanyInput,
} from './companies.schemas';

/** Panel del superadmin: grupos (empresas padre) y sus empresas. */
@Roles('superadmin')
@Controller('admin')
export class AdminController {
  constructor(private readonly companies: CompaniesRepository) {}

  @Get('groups')
  async groups() {
    return { groups: await this.companies.listGroups() };
  }

  /** Crea el grupo con su primera empresa (mismo nombre y código). */
  @Post('groups')
  async createGroup(
    @Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput,
  ) {
    return this.companies.createGroup(body);
  }

  @Post('groups/:groupId/companies')
  async createCompany(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyInput,
  ) {
    return { company: await this.companies.createCompany(groupId, body) };
  }

  @Patch('companies/:companyId')
  async updateCompany(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput,
  ) {
    const company = await this.companies.updateCompany(companyId, body);
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return { company };
  }
}
