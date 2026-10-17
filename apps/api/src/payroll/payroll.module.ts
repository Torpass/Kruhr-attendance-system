import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { PeriodsModule } from '../periods/periods.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { ContractsController } from './contracts.controller';
import { ContractsRepository } from './contracts.repository';
import { ContractsService } from './contracts.service';
import { MePayslipsController } from './me-payslips.controller';
import { PayslipPdfService } from './pdf/payslip-pdf.service';
import { RunsController } from './runs.controller';
import { RunsRepository } from './runs.repository';
import { RunsService } from './runs.service';

@Module({
  imports: [EmployeesModule, PeriodsModule, SchedulesModule],
  controllers: [
    CatalogController,
    ContractsController,
    RunsController,
    MePayslipsController,
  ],
  providers: [
    CatalogRepository,
    CatalogService,
    ContractsRepository,
    ContractsService,
    RunsRepository,
    RunsService,
    PayslipPdfService,
  ],
})
export class PayrollModule {}
