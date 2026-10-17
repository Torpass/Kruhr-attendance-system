import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createRunSchema,
  payslipInputsSchema,
  runActionSchema,
  type CreateRunInput,
  type PayslipInputsInput,
  type RunAction,
} from './payroll.schemas';
import { pdfFile } from './pdf/pdf-file';
import { PayslipPdfService } from './pdf/payslip-pdf.service';
import { RunsService } from './runs.service';

/** Lotes de nómina de una empresa. El acceso a `:companyId` lo valida TenantScopeGuard. */
@Roles('admin', 'analyst')
@Controller('companies/:companyId')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly pdfs: PayslipPdfService,
  ) {}

  @Get('payroll-runs')
  async list(@Param('companyId') companyId: string) {
    return { runs: await this.runs.list(companyId) };
  }

  @Post('payroll-runs')
  async create(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(createRunSchema)) body: CreateRunInput,
    @CurrentUser() user: SessionUser,
  ) {
    return { run: await this.runs.create(companyId, user.id, body) };
  }

  @Get('payroll-runs/:runId')
  async get(
    @Param('companyId') companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return { run: await this.runs.get(companyId, runId) };
  }

  /** recompute · validate · pay · cancel */
  @Post('payroll-runs/:runId/:action')
  @HttpCode(HttpStatus.OK)
  async act(
    @Param('companyId') companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('action', new ZodValidationPipe(runActionSchema)) action: RunAction,
  ) {
    return { run: await this.runs[action](companyId, runId) };
  }

  /** Todos los recibos de un lote pagado en un PDF, uno por página. */
  @Get('payroll-runs/:runId/pdf')
  async runPdf(
    @Param('companyId') companyId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return pdfFile(await this.pdfs.run(companyId, runId));
  }

  /** Recibo de pago en PDF (solo de lotes pagados). */
  @Get('payslips/:payslipId/pdf')
  async payslipPdf(
    @Param('companyId') companyId: string,
    @Param('payslipId', ParseUUIDPipe) payslipId: string,
  ) {
    return pdfFile(await this.pdfs.payslip({ companyId }, payslipId));
  }

  @Get('payslips/:payslipId')
  async payslip(
    @Param('companyId') companyId: string,
    @Param('payslipId', ParseUUIDPipe) payslipId: string,
  ) {
    return { payslip: await this.runs.getPayslip(companyId, payslipId) };
  }

  @Put('payslips/:payslipId/inputs')
  async setInputs(
    @Param('companyId') companyId: string,
    @Param('payslipId', ParseUUIDPipe) payslipId: string,
    @Body(new ZodValidationPipe(payslipInputsSchema)) body: PayslipInputsInput,
  ) {
    return {
      payslip: await this.runs.setInputs(companyId, payslipId, body.inputs),
    };
  }
}
