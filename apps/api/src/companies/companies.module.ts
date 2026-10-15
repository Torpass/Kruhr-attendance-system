import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CompaniesController } from './companies.controller';
import { CompaniesRepository } from './companies.repository';
import { TenantScopeGuard } from './tenant-scope.guard';

@Module({
  controllers: [CompaniesController, AdminController],
  providers: [CompaniesRepository, TenantScopeGuard],
  // El guard es global (AppModule) y protege las rutas de todos los módulos.
  exports: [CompaniesRepository, TenantScopeGuard],
})
export class CompaniesModule {}
