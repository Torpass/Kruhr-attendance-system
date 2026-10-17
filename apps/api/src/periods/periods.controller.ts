import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { periodQuerySchema, type PeriodQuery } from './periods.schemas';
import { PeriodsService, resolvePeriod } from './periods.service';

/** Cálculo del período y exportación a CSV. El acceso a `:companyId` lo valida TenantScopeGuard. */
@Roles('admin', 'analyst')
@Controller('companies/:companyId/periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  summary(
    @Param('companyId') companyId: string,
    @Query(new ZodValidationPipe(periodQuerySchema)) query: PeriodQuery,
  ) {
    return this.periods.summary(companyId, resolvePeriod(query));
  }

  @Get('export.csv')
  async export(
    @Param('companyId') companyId: string,
    @Query(new ZodValidationPipe(periodQuerySchema)) query: PeriodQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const period = resolvePeriod(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kruhr_${period.from}_${period.to}.csv"`,
    );
    return this.periods.csv(companyId, period);
  }
}
