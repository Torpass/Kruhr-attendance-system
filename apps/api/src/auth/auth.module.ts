import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
  // El JwtAuthGuard global (AppModule) resuelve la sesión con AuthService.
  exports: [AuthService],
})
export class AuthModule {}
