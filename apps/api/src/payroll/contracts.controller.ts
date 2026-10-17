import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContractsService } from './contracts.service';
import {
  changeScheduleSchema,
  createContractSchema,
  updateContractSchema,
  type ChangeScheduleInput,
  type CreateContractInput,
  type UpdateContractInput,
} from './payroll.schemas';

@Roles('admin', 'analyst')
@Controller('companies/:companyId/employees/:employeeId/contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  async list(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { contracts: await this.contracts.list(companyId, employeeId) };
  }

  @Post()
  async create(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(createContractSchema))
    body: CreateContractInput,
  ) {
    return {
      contracts: await this.contracts.create(companyId, employeeId, body),
    };
  }

  /** Otro horario desde una fecha: cierra este contrato el día anterior y abre uno igual. */
  @Post(':contractId/schedule')
  async changeSchedule(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(new ZodValidationPipe(changeScheduleSchema))
    body: ChangeScheduleInput,
  ) {
    return {
      contracts: await this.contracts.changeSchedule(
        companyId,
        employeeId,
        contractId,
        body,
      ),
    };
  }

  /** Cambia la vigencia: cerrar (fin), corregir el inicio o dejarlo sin fin. */
  @Patch(':contractId')
  async update(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(new ZodValidationPipe(updateContractSchema))
    body: UpdateContractInput,
  ) {
    return {
      contracts: await this.contracts.update(
        companyId,
        employeeId,
        contractId,
        body,
      ),
    };
  }

  /** Borra un contrato creado por error (sin recibos). */
  @Delete(':contractId')
  async remove(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    return {
      contracts: await this.contracts.remove(companyId, employeeId, contractId),
    };
  }
}
