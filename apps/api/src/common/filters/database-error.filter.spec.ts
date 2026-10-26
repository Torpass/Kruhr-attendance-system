import { Logger, type ArgumentsHost } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseErrorFilter } from './database-error.filter';

describe('DatabaseErrorFilter', () => {
  it('registra solo la causa, sin los parámetros de la consulta', () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    const error = new DrizzleQueryError(
      'insert into employees (password_hash) values ($1)',
      ['$argon2id$secreto'],
      new Error('connection terminated'),
    );
    new DatabaseErrorFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain('argon2id');
    expect(logged.mock.calls[0][0]).toBe('connection terminated');
  });
});
