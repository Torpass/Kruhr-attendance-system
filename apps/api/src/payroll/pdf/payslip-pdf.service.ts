import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RunsRepository } from '../runs.repository';
import { renderPayslipsPdf, type PayslipPdfData } from './payslip-pdf';

type Slip = NonNullable<Awaited<ReturnType<RunsRepository['findPayslip']>>>;

const NOT_PAID =
  'El recibo en PDF está disponible cuando el lote de nómina está pagado';

/**
 * Recibos de pago en PDF. Solo de lotes pagados: el recibo ya no cambia, así que se arma al
 * pedirlo con los datos guardados (no se almacena el archivo).
 */
@Injectable()
export class PayslipPdfService {
  constructor(private readonly runs: RunsRepository) {}

  /** Un recibo, para RRHH (`companyId`) o para el propio colaborador (`employeeId`). */
  async payslip(
    scope: { companyId: string } | { employeeId: string },
    payslipId: string,
  ) {
    const slip = await this.runs.findPayslip(scope, payslipId);
    if (!slip) throw new NotFoundException('Recibo no encontrado');
    if (slip.run.state !== 'paid') throw new ConflictException(NOT_PAID);
    const company = await this.runs.company(slip.companyId);
    return {
      pdf: await renderPayslipsPdf([toPdfData(slip, company)]),
      filename: `recibo_${slip.employee.cedula}_${slip.run.dateFrom}_${slip.run.dateTo}.pdf`,
    };
  }

  /** Todos los recibos de un lote pagado, uno por página. */
  async run(companyId: string, runId: string) {
    const run = await this.runs.find(companyId, runId);
    if (!run) throw new NotFoundException('Lote no encontrado');
    if (run.state !== 'paid') throw new ConflictException(NOT_PAID);
    const [company, list] = await Promise.all([
      this.runs.company(companyId),
      this.runs.payslips(runId),
    ]);
    const slips = await Promise.all(
      list.map((s) => this.runs.findPayslip({ companyId }, s.id)),
    );
    return {
      pdf: await renderPayslipsPdf(
        slips
          .filter((s): s is Slip => Boolean(s))
          .map((s) => toPdfData(s, company)),
      ),
      filename: `recibos_${run.dateFrom}_${run.dateTo}.pdf`,
    };
  }
}

function toPdfData(
  slip: Slip,
  company: { name: string; rif: string | null } | undefined,
): PayslipPdfData {
  return {
    company: company ?? { name: '', rif: null },
    employee: slip.employee,
    run: slip.run,
    wage: slip.wage,
    earnings: slip.earnings,
    deductions: slip.deductions,
    net: slip.net,
    lines: slip.lines.filter((line) => line.appearsOnPayslip),
    workedMinutes: slip.workedMinutes,
  };
}
