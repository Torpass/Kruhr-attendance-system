import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AttendanceModule } from './attendance/attendance.module';
import { CompaniesModule } from './companies/companies.module';
import { TenantScopeGuard } from './companies/tenant-scope.guard';
import { DatabaseErrorFilter } from './common/filters/database-error.filter';
import { EmployeesModule } from './employees/employees.module';
import { PeriodsModule } from './periods/periods.module';
import { StaffModule } from './staff/staff.module';
import { validateEnv, type Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      // Sin límite efectivo salvo donde una ruta lo sobreescribe con @Throttle (login por cuenta).
      { name: 'account', ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
    ]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
        },
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CompaniesModule,
    EmployeesModule,
    AttendanceModule,
    PeriodsModule,
    StaffModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // En orden: límite de requests → sesión → rol → empresa o grupo.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    { provide: APP_FILTER, useClass: DatabaseErrorFilter },
  ],
})
export class AppModule {}
