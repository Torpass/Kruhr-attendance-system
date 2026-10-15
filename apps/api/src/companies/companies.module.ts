import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesRepository } from './companies.repository';
import { CompanyScopeGuard } from './company-scope.guard';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesRepository, CompanyScopeGuard],
  // El guard es global (AppModule) y protege las rutas de todos los módulos.
  exports: [CompaniesRepository, CompanyScopeGuard],
})
export class CompaniesModule {}
