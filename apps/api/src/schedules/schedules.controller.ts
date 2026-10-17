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
import {
  createScheduleSchema,
  updateScheduleSchema,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from './schedules.schemas';
import { SchedulesService } from './schedules.service';

/** Horarios del grupo. El acceso a `:groupId` lo valida TenantScopeGuard. */
@Roles('admin', 'analyst')
@Controller('groups/:groupId/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  async list(@Param('groupId') groupId: string) {
    return { schedules: await this.schedules.list(groupId) };
  }

  @Get(':scheduleId')
  async get(
    @Param('groupId') groupId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return { schedule: await this.schedules.get(groupId, scheduleId) };
  }

  @Post()
  async create(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createScheduleSchema))
    body: CreateScheduleInput,
  ) {
    return { schedule: await this.schedules.create(groupId, body) };
  }

  /**
   * Editar un horario cambia el cálculo de los turnos de sus contratos, también hacia atrás.
   * Los recibos guardados de un lote no cambian hasta que se recalcule el lote.
   */
  @Patch(':scheduleId')
  async update(
    @Param('groupId') groupId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body(new ZodValidationPipe(updateScheduleSchema))
    body: UpdateScheduleInput,
  ) {
    return {
      schedule: await this.schedules.update(groupId, scheduleId, body),
    };
  }
}
