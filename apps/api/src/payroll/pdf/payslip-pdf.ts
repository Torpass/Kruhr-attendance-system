import { join, dirname } from 'node:path';
import PDFDocument from 'pdfkit';

/** Datos de un recibo para imprimir (solo las líneas visibles en el recibo). */
export interface PayslipPdfData {
  company: { name: string; rif: string | null };
  employee: { name: string; cedula: string };
  run: { name: string; dateFrom: string; dateTo: string };
  wage: number;
  earnings: number;
  deductions: number;
  net: number;
  lines: { code: string; name: string; quantity: number; total: number }[];
  /** Minutos por código de horas: WORK, NIGHT, OT_DAY, OT_NIGHT. */
  workedMinutes: Record<string, number>;
}

/** Colores del design system de Kru (docs/design-system.md). */
const C = {
  kru50: '#F5F3FF',
  kru100: '#EDE9FE',
  kru700: '#6D28D9',
  kru800: '#5B21B6',
  grafito: '#111827',
  gris: '#4B5563',
  grisClaro: '#9CA3AF',
  borde: '#E5E7EB',
  hueso: '#F3F4F6',
  exitoFondo: '#DCFCE7',
  exitoTexto: '#15803D',
  errorTexto: '#B91C1C',
};

const fontsDir = join(
  dirname(require.resolve('@fontsource/inter/package.json')),
  'files',
);
const FONTS = {
  regular: join(fontsDir, 'inter-latin-400-normal.woff'),
  semibold: join(fontsDir, 'inter-latin-600-normal.woff'),
  bold: join(fontsDir, 'inter-latin-700-normal.woff'),
  extrabold: join(fontsDir, 'inter-latin-800-normal.woff'),
};
const LOGO = join(__dirname, 'kru-logo.png');

const money = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const longDate = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const formatDate = (localDate: string) =>
  longDate.format(new Date(`${localDate}T00:00:00Z`));

/** "1 al 15 de octubre de 2026" (mismo mes) o las dos fechas completas. */
function periodLabel(from: string, to: string) {
  if (from.slice(0, 7) !== to.slice(0, 7)) {
    return `${formatDate(from)} al ${formatDate(to)}`;
  }
  return `${Number(from.slice(8))} al ${formatDate(to)}`;
}
const hours = (minutes = 0) =>
  money.format(Math.round((minutes * 100) / 60) / 100);

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const CONTENT = PAGE.width - PAGE.margin * 2;

type Doc = PDFKit.PDFDocument;

/** Rótulo en mayúsculas pequeñas, como `.rotulo` en la web. */
function label(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width?: number,
  align: 'left' | 'right' = 'left',
) {
  doc
    .font('semibold')
    .fontSize(7)
    .fillColor(C.gris)
    .text(text.toUpperCase(), x, y, { width, align, characterSpacing: 0.6 });
}

function header(doc: Doc, data: PayslipPdfData) {
  const top = PAGE.margin;
  doc.image(LOGO, PAGE.margin, top, { height: 22 });
  doc
    .font('extrabold')
    .fontSize(20)
    .fillColor(C.kru700)
    .text('Hr', PAGE.margin + 82, top + 1, { lineBreak: false });

  const right = PAGE.margin + CONTENT;
  label(doc, 'Recibo de pago', right - 200, top, 200, 'right');
  doc
    .font('bold')
    .fontSize(11)
    .fillColor(C.grafito)
    .text(data.run.name, right - 260, top + 11, { width: 260, align: 'right' });

  // Insignia "Pagado" (como Badge tone="exito").
  const badge = 'PAGADO';
  doc.font('semibold').fontSize(7);
  const w = doc.widthOfString(badge, { characterSpacing: 0.6 }) + 14;
  doc.roundedRect(right - w, top + 28, w, 14, 7).fill(C.exitoFondo);
  doc.fillColor(C.exitoTexto).text(badge, right - w, top + 32, {
    width: w,
    align: 'center',
    characterSpacing: 0.6,
  });

  doc
    .moveTo(PAGE.margin, top + 54)
    .lineTo(right, top + 54)
    .lineWidth(0.75)
    .strokeColor(C.borde)
    .stroke();
  return top + 70;
}

/** Tarjeta con borde y una lista de pares rótulo/valor. */
function infoCard(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  rows: [string, string][],
) {
  const height = 18 + rows.length * 30;
  doc
    .roundedRect(x, y, width, height, 10)
    .lineWidth(0.75)
    .strokeColor(C.borde)
    .stroke();
  rows.forEach(([key, value], i) => {
    const ry = y + 12 + i * 30;
    label(doc, key, x + 14, ry, width - 28);
    doc
      .font('semibold')
      .fontSize(10)
      .fillColor(C.grafito)
      .text(value, x + 14, ry + 10, {
        width: width - 28,
        lineBreak: false,
        ellipsis: true,
      });
  });
  return height;
}

function hoursRow(doc: Doc, y: number, minutes: Record<string, number>) {
  const items: [string, number][] = [
    ['Ordinarias', minutes.WORK ?? 0],
    ['Nocturnas ord.', minutes.NIGHT ?? 0],
    ['Extra diurnas', minutes.OT_DAY ?? 0],
    ['Extra nocturnas', minutes.OT_NIGHT ?? 0],
  ];
  const gap = 8;
  const w = (CONTENT - gap * 3) / 4;
  items.forEach(([key, value], i) => {
    const x = PAGE.margin + i * (w + gap);
    doc.roundedRect(x, y, w, 46, 8).fill(C.hueso);
    label(doc, key, x + 10, y + 9, w - 20);
    doc
      .font('bold')
      .fontSize(13)
      .fillColor(C.grafito)
      .text(hours(value), x + 10, y + 22, { width: w - 20 });
  });
  return 46;
}

function linesTable(doc: Doc, y: number, data: PayslipPdfData) {
  const cols = [
    { title: 'Concepto', width: CONTENT - 3 * 95, align: 'left' as const },
    { title: 'Cantidad', width: 95, align: 'right' as const },
    { title: 'Asignaciones', width: 95, align: 'right' as const },
    { title: 'Deducciones', width: 95, align: 'right' as const },
  ];
  const xs = cols.map((_, i) =>
    cols.slice(0, i).reduce((x, c) => x + c.width, PAGE.margin),
  );
  const cell = (
    text: string,
    i: number,
    rowY: number,
    font = 'regular',
    color = C.grafito,
  ) =>
    doc
      .font(font)
      .fontSize(9.5)
      .fillColor(color)
      .text(text, xs[i] + 10, rowY, {
        width: cols[i].width - 20,
        align: cols[i].align,
        lineBreak: false,
        ellipsis: true,
      });

  doc.roundedRect(PAGE.margin, y, CONTENT, 24, 6).fill(C.hueso);
  cols.forEach((c, i) => {
    doc
      .font('semibold')
      .fontSize(7)
      .fillColor(C.gris)
      .text(c.title.toUpperCase(), xs[i] + 10, y + 9, {
        width: c.width - 20,
        align: c.align,
        characterSpacing: 0.6,
      });
  });

  let rowY = y + 24;
  for (const line of data.lines) {
    cell(line.name, 0, rowY + 8);
    cell(money.format(line.quantity), 1, rowY + 8, 'regular', C.gris);
    if (line.total >= 0) cell(money.format(line.total), 2, rowY + 8);
    else cell(money.format(-line.total), 3, rowY + 8, 'regular', C.errorTexto);
    rowY += 26;
    doc
      .moveTo(PAGE.margin, rowY)
      .lineTo(PAGE.margin + CONTENT, rowY)
      .lineWidth(0.5)
      .strokeColor(C.borde)
      .stroke();
  }

  cell('Totales', 0, rowY + 8, 'semibold');
  cell(money.format(data.earnings), 2, rowY + 8, 'semibold');
  cell(money.format(data.deductions), 3, rowY + 8, 'semibold', C.errorTexto);
  return rowY + 28 - y;
}

function netCard(doc: Doc, y: number, net: number) {
  doc
    .roundedRect(PAGE.margin, y, CONTENT, 58, 12)
    .lineWidth(0.75)
    .fillAndStroke(C.kru50, C.kru100);
  label(doc, 'Neto a pagar', PAGE.margin + 18, y + 14);
  doc
    .font('extrabold')
    .fontSize(22)
    .fillColor(C.kru800)
    .text(`Bs. ${money.format(net)}`, PAGE.margin + 18, y + 24, {
      width: CONTENT - 36,
    });
  return 58;
}

function signatures(doc: Doc, y: number) {
  const w = (CONTENT - 40) / 2;
  ['Recibí conforme · colaborador', 'Por la empresa'].forEach((text, i) => {
    const x = PAGE.margin + i * (w + 40);
    doc
      .moveTo(x, y + 30)
      .lineTo(x + w, y + 30)
      .lineWidth(0.75)
      .strokeColor(C.grisClaro)
      .stroke();
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(C.gris)
      .text(text, x, y + 36, { width: w, align: 'center' });
  });
}

function footer(doc: Doc, generatedAt: Date) {
  const when = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(generatedAt);
  doc
    .font('regular')
    .fontSize(7.5)
    .fillColor(C.grisClaro)
    .text(
      `Generado con KruHr · ${when}`,
      PAGE.margin,
      PAGE.height - PAGE.margin - 10,
      { width: CONTENT, align: 'center', lineBreak: false },
    );
}

function payslipPage(doc: Doc, data: PayslipPdfData, generatedAt: Date) {
  let y = header(doc, data);

  const gap = 12;
  const half = (CONTENT - gap) / 2;
  const left = infoCard(doc, PAGE.margin, y, half, [
    ['Empresa', data.company.name],
    ['RIF', data.company.rif ?? '—'],
    ['Período', periodLabel(data.run.dateFrom, data.run.dateTo)],
  ]);
  infoCard(doc, PAGE.margin + half + gap, y, half, [
    ['Colaborador', data.employee.name],
    ['Cédula', data.employee.cedula],
    ['Salario mensual', `Bs. ${money.format(data.wage)}`],
  ]);
  y += left + 16;

  label(doc, 'Horas del período', PAGE.margin, y);
  y += hoursRow(doc, y + 12, data.workedMinutes) + 26;

  y += linesTable(doc, y, data) + 16;
  y += netCard(doc, y, data.net) + 48;
  signatures(doc, Math.min(y, PAGE.height - PAGE.margin - 90));
  footer(doc, generatedAt);
}

/**
 * Recibos de pago en PDF (A4), uno por página, con el design system de Kru: logo, Inter,
 * tarjetas con borde, rótulos en mayúsculas y el neto destacado en morado.
 */
export function renderPayslipsPdf(
  slips: PayslipPdfData[],
  generatedAt = new Date(),
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      autoFirstPage: false,
      info: { Title: 'Recibo de pago', Author: 'KruHr', Creator: 'KruHr' },
    });
    for (const [name, file] of Object.entries(FONTS))
      doc.registerFont(name, file);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const slip of slips) {
      doc.addPage();
      payslipPage(doc, slip, generatedAt);
    }
    doc.end();
  });
}
