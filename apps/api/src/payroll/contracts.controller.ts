import {
  Body,
  Controller,
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
  endContractSchema,
  type ChangeScheduleInput,
  type CreateContractInput,
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

  /** Cierra el contrato (p. ej. antes de uno nuevo con otro salario). */
  @Patch(':contractId')
  async end(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body(new ZodValidationPipe(endContractSchema)) body: { dateEnd: string },
  ) {
    return {
      contracts: await this.contracts.end(
        companyId,
        employeeId,
        contractId,
        body.dateEnd,
      ),
    };
  }
}
