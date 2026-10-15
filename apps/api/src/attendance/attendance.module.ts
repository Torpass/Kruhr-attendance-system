import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { AttendanceService } from './attendance.service';
import { CompanyAttendanceController } from './company-attendance.controller';
import { MeController } from './me.controller';
import { ShiftsRepository } from './shifts.repository';

@Module({
  imports: [EmployeesModule],
  controllers: [MeController, CompanyAttendanceController],
  providers: [AttendanceService, ShiftsRepository],
  exports: [ShiftsRepository],
})
export class AttendanceModule {}
