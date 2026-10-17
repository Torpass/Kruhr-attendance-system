import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { PeriodsController } from './periods.controller';
import { PeriodsService } from './periods.service';

@Module({
  imports: [AttendanceModule, EmployeesModule, SchedulesModule],
  controllers: [PeriodsController],
  providers: [PeriodsService],
  exports: [PeriodsService],
})
export class PeriodsModule {}
