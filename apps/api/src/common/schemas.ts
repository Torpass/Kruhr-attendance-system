import { isLocalDate } from '@marcaje/core';
import { z } from 'zod';

/** Cédula: acepta "V-12.345.678" y deja solo los dígitos. */
export const cedulaSchema = z
  .string()
  .max(20)
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{5,10}$/, 'Cédula inválida'));

export const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'El PIN tiene de 4 a 6 dígitos');

/** Nombre de persona. Debe empezar por una letra: evita fórmulas al abrir el CSV en una hoja de cálculo. */
export const personNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^\p{L}/u, 'El nombre debe empezar por una letra');

/** Fecha de calendario YYYY-MM-DD. */
export const localDateSchema = z
  .string()
  .refine(isLocalDate, 'Fecha inválida (YYYY-MM-DD)');
