import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  correctShiftSchema,
  createShiftSchema,
  shiftsQuerySchema,
  type CorrectShiftInput,
  type CreateShiftInput,
  type ShiftsQuery,
} from './attendance.schemas';
import { AttendanceService } from './attendance.service';

/** RRHH: ver el día y corregir turnos. El acceso a `:companyId` lo valida CompanyScopeGuard. */
@Roles('admin', 'analyst')
@Controller('companies/:companyId')
export class CompanyAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@Param('companyId') companyId: string) {
    return this.attendance.companyToday(companyId);
  }

  @Get('shifts')
  async shifts(
    @Param('companyId') companyId: string,
    @Query(new ZodValidationPipe(shiftsQuerySchema)) query: ShiftsQuery,
  ) {
    return { shifts: await this.attendance.listShifts(companyId, query) };
  }

  @Post('shifts')
  async create(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(createShiftSchema)) body: CreateShiftInput,
    @CurrentUser() user: SessionUser,
  ) {
    return {
      shift: await this.attendance.createShift(companyId, body, user.id),
    };
  }

  @Patch('shifts/:shiftId')
  async correct(
    @Param('companyId') companyId: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body(new ZodValidationPipe(correctShiftSchema)) body: CorrectShiftInput,
    @CurrentUser() user: SessionUser,
  ) {
    return {
      shift: await this.attendance.correctShift(
        companyId,
        shiftId,
        body,
        user.id,
      ),
    };
  }

  @Get('shifts/:shiftId/corrections')
  async corrections(
    @Param('companyId') companyId: string,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
  ) {
    return {
      corrections: await this.attendance.corrections(companyId, shiftId),
    };
  }
}
