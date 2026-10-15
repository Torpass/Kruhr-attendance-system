import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { Response } from 'express';

/**
 * Errores de base que nadie tradujo a una respuesta HTTP.
 * El mensaje de Drizzle trae los parámetros de la consulta (pueden ser hashes de PIN o
 * contraseñas), así que solo se registra la causa de Postgres y el cliente recibe un 500 genérico.
 */
@Catch(DrizzleQueryError)
export class DatabaseErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(error: DrizzleQueryError, host: ArgumentsHost) {
    const cause = error.cause;
    this.logger.error(
      cause?.message ?? 'Falló una consulta a la base',
      cause?.stack,
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      });
  }
}
