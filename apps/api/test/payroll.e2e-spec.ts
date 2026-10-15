import {
  SAMPLE_BIWEEKLY_RULES,
  SAMPLE_INPUT_TYPES,
  SAMPLE_PARAMETERS,
} from '@marcaje/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type TestAgent from 'supertest/lib/agent';
import * as schema from '../src/database/schema';
import {
  connectTestDatabase,
  loginEmployee,
  loginStaff,
  seedTenants,
  startApp,
} from './fixtures';

const caracas = (local: string) => new Date(`${local}-04:00`).toISOString();

/**
 * Nómina de punta a punta contra Postgres real: catálogo del grupo, contrato, lote con las horas
 * del motor de asistencia, entradas, validación (que bloquea correcciones), pago y "mis recibos".
 */
describe('Nómina (integración)', () => {
  let app: NestExpressApplication;
  const { client, db } = connectTestDatabase();
  let ids: Awaited<ReturnType<typeof seedTenants>>;
  const agents = {} as Record<
    'adminA' | 'analystA' | 'adminB' | 'luis' | 'ana',
    TestAgent
  >;
  let structureId: string;
  let runId: string;
  let luisSlip: string;

  beforeAll(async () => {
    ids = await seedTenants(db);
    app = await startApp();
    agents.adminA = await loginStaff(app, 'admin-a@t.test');
    agents.analystA = await loginStaff(app, 'analista-a@t.test');
    agents.adminB = await loginStaff(app, 'admin-b@t.test');
    agents.luis = await loginEmployee(app, '87654321');
    agents.ana = await loginEmployee(app, '12345678', ids.norte);

    // Los dos turnos del enunciado para Luis, en la 1.ª quincena de octubre.
    await db.insert(schema.shifts).values([
      {
        companyId: ids.norte,
        employeeId: ids.luis,
        clockIn: new Date(caracas('2026-10-05T06:00')),
        clockOut: new Date(caracas('2026-10-05T16:00')),
      },
      {
        companyId: ids.norte,
        employeeId: ids.luis,
        clockIn: new Date(caracas('2026-10-06T14:00')),
        clockOut: new Date(caracas('2026-10-07T00:30')),
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  const group = (path: string) => `/api/groups/${ids.groupA}/${path}`;
  const company = (path: string) => `/api/companies/${ids.norte}/${path}`;

  describe('catálogo del grupo', () => {
    it('el analista crea parámetros, entradas y la estructura de referencia', async () => {
      for (const { code, name, value } of SAMPLE_PARAMETERS) {
        await agents.analystA
          .post(group('parameters'))
          .send({ code, name, value, dateFrom: '2026-01-01' })
          .expect(201);
      }
      for (const type of SAMPLE_INPUT_TYPES) {
        await agents.analystA.post(group('input-types')).send(type).expect(201);
      }
      const res = await agents.analystA
        .post(group('structures'))
        .send({
          code: 'QUINCENAL_VE',
          name: 'Quincenal VE',
          schedulePay: 'semi_monthly',
          rules: SAMPLE_BIWEEKLY_RULES,
        })
        .expect(201);
      structureId = res.body.structure.id;
      expect(res.body.structure.rules).toHaveLength(
        SAMPLE_BIWEEKLY_RULES.length,
      );
    });

    it('rechaza reglas inconsistentes y códigos repetidos; otro grupo no ve el catálogo', async () => {
      const broken = await agents.analystA
        .post(group('structures'))
        .send({
          code: 'MALA',
          name: 'Mala',
          schedulePay: 'monthly',
          rules: [
            {
              code: 'NET',
              name: 'Neto',
              sequence: 1,
              amountType: 'percentage_of',
              baseCodes: ['BASIC'],
              rate: 100,
            },
          ],
        })
        .expect(400);
      expect(JSON.stringify(broken.body)).toContain(
        'BASIC no es una regla anterior',
      );

      await agents.analystA
        .post(group('input-types'))
        .send({ code: 'BONO', name: 'Otro bono' })
        .expect(409);
      await agents.adminB.get(group('structures')).expect(404);
    });

    it('un parámetro nuevo rige desde su fecha', async () => {
      const params = await agents.adminA.get(group('parameters')).expect(200);
      const minWage = params.body.parameters.find(
        (p: { code: string }) => p.code === 'SALARIO_MINIMO',
      );
      await agents.adminA
        .put(group(`parameters/${minWage.id}/values`))
        .send({ dateFrom: '2026-11-01', value: 200 })
        .expect(200);
      const after = await agents.adminA.get(group('parameters')).expect(200);
      expect(
        after.body.parameters.find(
          (p: { code: string }) => p.code === 'SALARIO_MINIMO',
        ).values,
      ).toEqual([
        { dateFrom: '2026-11-01', value: 200 },
        { dateFrom: '2026-01-01', value: 130 },
      ]);
    });
  });

  describe('contratos', () => {
    it('crea el contrato de Luis y rechaza uno que se solape', async () => {
      const url = company(`employees/${ids.luis}/contracts`);
      await agents.analystA
        .post(url)
        .send({ structureId, wage: 3600, dateStart: '2026-01-01' })
        .expect(201);
      await agents.analystA
        .post(url)
        .send({ structureId, wage: 4000, dateStart: '2026-06-01' })
        .expect(409);
      await agents.adminB
        .post(`/api/companies/${ids.b}/employees/${ids.bea}/contracts`)
        .send({ structureId, wage: 1000, dateStart: '2026-01-01' })
        .expect(404); // la estructura es del grupo A
    });
  });

  describe('lote de la 1.ª quincena', () => {
    it('calcula el recibo de Luis con las horas del enunciado', async () => {
      const res = await agents.analystA
        .post(company('payroll-runs'))
        .send({ structureId, kind: 'first_half', date: '2026-10-10' })
        .expect(201);
      runId = res.body.run.id;
      expect(res.body.run).toMatchObject({
        state: 'computed',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-15',
      });
      expect(res.body.run.payslips).toHaveLength(1);
      luisSlip = res.body.run.payslips[0].id;

      const slip = await agents.analystA
        .get(company(`payslips/${luisSlip}`))
        .expect(200);
      expect(slip.body.payslip).toMatchObject({
        earnings: 1931.63,
        deductions: -34.32,
        net: 1897.31,
      });
      expect(slip.body.payslip.workedMinutes).toEqual({
        WORK: 960,
        NIGHT: 180,
        OT_DAY: 120,
        OT_NIGHT: 150,
      });
      expect(
        Object.fromEntries(
          (slip.body.payslip.lines as { code: string; total: number }[]).map(
            (l) => [l.code, l.total],
          ),
        ),
      ).toMatchObject({
        BASIC: 1800,
        HED: 45,
        HEN: 73.13,
        BN: 13.5,
        IVSS: -12,
        RPE: -3,
        FAOV: -19.32,
      });
    });

    it('no permite otro lote vigente que se solape', async () => {
      await agents.analystA
        .post(company('payroll-runs'))
        .send({ structureId, from: '2026-10-10', to: '2026-10-20' })
        .expect(409);
    });

    it('las entradas recalculan el recibo y deben existir en el catálogo', async () => {
      const res = await agents.analystA
        .put(company(`payslips/${luisSlip}/inputs`))
        .send({ inputs: { BONO: 200 } })
        .expect(200);
      expect(res.body.payslip.net).toBe(1897.31 + 200 - 2); // FAOV sube 2,00
      await agents.analystA
        .put(company(`payslips/${luisSlip}/inputs`))
        .send({ inputs: { NOEXISTE: 1 } })
        .expect(400);
    });

    it('recalcular toma los cambios de asistencia; validar exige que no haya turnos abiertos', async () => {
      const [open] = await db
        .insert(schema.shifts)
        .values({
          companyId: ids.norte,
          employeeId: ids.luis,
          clockIn: new Date(caracas('2026-10-09T08:00')),
        })
        .returning();
      await agents.analystA
        .post(company(`payroll-runs/${runId}/validate`))
        .expect(409);

      await agents.analystA
        .patch(company(`shifts/${open.id}`))
        .send({
          clockOut: caracas('2026-10-09T18:00'),
          reason: 'Olvidó marcar la salida',
        })
        .expect(200);
      const recomputed = await agents.analystA
        .post(company(`payroll-runs/${runId}/recompute`))
        .expect(200);
      expect(recomputed.body.run.payslips[0].net).toBeGreaterThan(
        1897.31 + 198,
      );

      await agents.analystA
        .post(company(`payroll-runs/${runId}/validate`))
        .expect(200);
    });

    it('validado: no se recalcula ni se corrigen turnos del período', async () => {
      await agents.analystA
        .post(company(`payroll-runs/${runId}/recompute`))
        .expect(409);
      await agents.analystA
        .put(company(`payslips/${luisSlip}/inputs`))
        .send({ inputs: {} })
        .expect(409);
      const shifts = await agents.analystA
        .get(
          company(
            `shifts?from=2026-10-05&to=2026-10-05&employeeId=${ids.luis}`,
          ),
        )
        .expect(200);
      await agents.analystA
        .patch(company(`shifts/${shifts.body.shifts[0].id}`))
        .send({
          clockOut: caracas('2026-10-05T17:00'),
          reason: 'Intento tardío',
        })
        .expect(409);
      await agents.analystA
        .post(company('shifts'))
        .send({
          employeeId: ids.ana,
          clockIn: caracas('2026-10-08T08:00'),
          clockOut: caracas('2026-10-08T12:00'),
          reason: 'Turno olvidado',
        })
        .expect(409);
      // Fuera del período sí se puede.
      await agents.analystA
        .post(company('shifts'))
        .send({
          employeeId: ids.ana,
          clockIn: caracas('2026-09-28T08:00'),
          clockOut: caracas('2026-09-28T12:00'),
          reason: 'Turno olvidado',
        })
        .expect(201);
    });

    it('el colaborador ve su recibo validado, solo con las líneas visibles', async () => {
      const list = await agents.luis.get('/api/me/payslips').expect(200);
      expect(list.body.payslips).toHaveLength(1);
      const slip = await agents.luis
        .get(`/api/me/payslips/${luisSlip}`)
        .expect(200);
      const codes = slip.body.payslip.lines.map(
        (l: { code: string }) => l.code,
      );
      expect(codes).toContain('BASIC');
      expect(codes).not.toContain('GROSS');
      expect(codes).not.toContain('NET');
      await agents.ana.get(`/api/me/payslips/${luisSlip}`).expect(404);
    });

    it('pagar y anular siguen el ciclo de vida', async () => {
      await agents.adminA
        .post(company(`payroll-runs/${runId}/pay`))
        .expect(200);
      await agents.adminA
        .post(company(`payroll-runs/${runId}/cancel`))
        .expect(409);
      await agents.adminA
        .post(company(`payroll-runs/${runId}/borrar`))
        .expect(400);
      const runs = await agents.adminA.get(company('payroll-runs')).expect(200);
      expect(runs.body.runs[0]).toMatchObject({ state: 'paid', payslips: 1 });
      await agents.adminB
        .get(`/api/companies/${ids.norte}/payroll-runs`)
        .expect(404);
    });
  });
});
