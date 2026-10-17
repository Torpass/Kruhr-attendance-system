import { StreamableFile } from '@nestjs/common';

/** Respuesta de descarga de un PDF (`attachment` con su nombre de archivo). */
export function pdfFile({ pdf, filename }: { pdf: Buffer; filename: string }) {
  return new StreamableFile(pdf, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
    length: pdf.length,
  });
}
