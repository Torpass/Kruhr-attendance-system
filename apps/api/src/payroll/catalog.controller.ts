import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CatalogService } from './catalog.service';
import {
  createParameterSchema,
  createStructureSchema,
  inputTypeSchema,
  parameterValueSchema,
  updateStructureSchema,
  type CreateParameterInput,
  type CreateStructureInput,
  type InputTypeInput,
  type ParameterValueInput,
  type UpdateStructureInput,
} from './payroll.schemas';

/** Catálogo de nómina del grupo. El acceso a `:groupId` lo valida TenantScopeGuard. */
@Roles('admin', 'analyst')
@Controller('groups/:groupId')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('structures')
  async structures(@Param('groupId') groupId: string) {
    return { structures: await this.catalog.listStructures(groupId) };
  }

  @Get('structures/:structureId')
  async structure(
    @Param('groupId') groupId: string,
    @Param('structureId', ParseUUIDPipe) structureId: string,
  ) {
    return { structure: await this.catalog.getStructure(groupId, structureId) };
  }

  @Post('structures')
  async createStructure(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createStructureSchema))
    body: CreateStructureInput,
  ) {
    return { structure: await this.catalog.createStructure(groupId, body) };
  }

  /** Edita la estructura y, si vienen, reemplaza todas sus reglas. */
  @Patch('structures/:structureId')
  async updateStructure(
    @Param('groupId') groupId: string,
    @Param('structureId', ParseUUIDPipe) structureId: string,
    @Body(new ZodValidationPipe(updateStructureSchema))
    body: UpdateStructureInput,
  ) {
    return {
      structure: await this.catalog.updateStructure(groupId, structureId, body),
    };
  }

  @Get('parameters')
  async parameters(@Param('groupId') groupId: string) {
    return { parameters: await this.catalog.listParameters(groupId) };
  }

  @Post('parameters')
  async createParameter(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createParameterSchema))
    body: CreateParameterInput,
  ) {
    return { parameters: await this.catalog.createParameter(groupId, body) };
  }

  @Put('parameters/:parameterId/values')
  async setParameterValue(
    @Param('groupId') groupId: string,
    @Param('parameterId', ParseUUIDPipe) parameterId: string,
    @Body(new ZodValidationPipe(parameterValueSchema))
    body: ParameterValueInput,
  ) {
    return {
      parameters: await this.catalog.setParameterValue(
        groupId,
        parameterId,
        body,
      ),
    };
  }

  @Get('input-types')
  async inputTypes(@Param('groupId') groupId: string) {
    return { inputTypes: await this.catalog.listInputTypes(groupId) };
  }

  @Post('input-types')
  async createInputType(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(inputTypeSchema)) body: InputTypeInput,
  ) {
    return { inputType: await this.catalog.createInputType(groupId, body) };
  }
}
