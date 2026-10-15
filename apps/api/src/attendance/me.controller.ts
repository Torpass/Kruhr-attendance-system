import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { dateRangeSchema, type DateRange } from './attendance.schemas';
import { AttendanceService } from './attendance.service';

function asEmployee(user: SessionUser) {
  // RolesGuard ya lo garantiza; esto solo estrecha el tipo.
  if (user.kind !== 'employee') throw new ForbiddenException();
  return user;
}

/** El colaborador marca y consulta lo suyo. La hora siempre la pone el servidor. */
@Roles('employee')
@Controller('me')
export class MeController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('clock-in')
  @HttpCode(HttpStatus.CREATED)
  async clockIn(@CurrentUser() user: SessionUser) {
    return { shift: await this.attendance.clockIn(asEmployee(user)) };
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  async clockOut(@CurrentUser() user: SessionUser) {
    return { shift: await this.attendance.clockOut(asEmployee(user)) };
  }

  @Get('today')
  today(@CurrentUser() user: SessionUser) {
    return this.attendance.myToday(asEmployee(user));
  }

  @Get('shifts')
  async shifts(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(dateRangeSchema)) period: DateRange,
  ) {
    return { shifts: await this.attendance.myShifts(asEmployee(user), period) };
  }
}
