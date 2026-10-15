import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from './staff.schemas';
import { StaffService } from './staff.service';

function asStaff(user: SessionUser) {
  // RolesGuard ya lo garantiza; esto solo estrecha el tipo.
  if (user.kind !== 'staff') throw new ForbiddenException();
  return user;
}

/** Equipo de gestión de un grupo. El acceso a `:groupId` lo valida TenantScopeGuard. */
@Roles('admin')
@Controller('groups/:groupId/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  async list(@Param('groupId') groupId: string) {
    return { staff: await this.staff.list(groupId) };
  }

  @Post()
  async create(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
    @CurrentUser() user: SessionUser,
  ) {
    return { member: await this.staff.create(asStaff(user), groupId, body) };
  }

  @Patch(':userId')
  async update(
    @Param('groupId') groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
    @CurrentUser() user: SessionUser,
  ) {
    return {
      member: await this.staff.update(asStaff(user), groupId, userId, body),
    };
  }
}
