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
  createContractSchema,
  endContractSchema,
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
