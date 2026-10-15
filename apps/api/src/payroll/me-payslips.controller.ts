import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import type { SessionUser } from '../common/auth/session';
import { RunsRepository } from './runs.repository';

/** El colaborador ve sus recibos validados o pagados, solo con las líneas visibles. */
@Roles('employee')
@Controller('me/payslips')
export class MePayslipsController {
  constructor(private readonly runs: RunsRepository) {}

  @Get()
  async list(@CurrentUser() user: SessionUser) {
    return { payslips: await this.runs.listForEmployee(employeeId(user)) };
  }

  @Get(':payslipId')
  async get(
    @CurrentUser() user: SessionUser,
    @Param('payslipId', ParseUUIDPipe) payslipId: string,
  ) {
    const slip = await this.runs.findPayslip(
      { employeeId: employeeId(user), states: ['validated', 'paid'] },
      payslipId,
    );
    if (!slip) throw new NotFoundException('Recibo no encontrado');
    return {
      payslip: {
        id: slip.id,
        employee: slip.employee,
        companyName: user.kind === 'employee' ? user.companyName : '',
        run: {
          name: slip.run.name,
          dateFrom: slip.run.dateFrom,
          dateTo: slip.run.dateTo,
          state: slip.run.state,
        },
        wage: slip.wage,
        earnings: slip.earnings,
        deductions: slip.deductions,
        net: slip.net,
        lines: slip.lines.filter((line) => line.appearsOnPayslip),
      },
    };
  }
}

function employeeId(user: SessionUser) {
  // RolesGuard ya lo garantiza; esto solo estrecha el tipo.
  if (user.kind !== 'employee') throw new ForbiddenException();
  return user.id;
}
