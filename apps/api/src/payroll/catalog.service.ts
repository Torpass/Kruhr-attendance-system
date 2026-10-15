import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pgError, PG_UNIQUE_VIOLATION } from '../database/pg-error';
import { CatalogRepository } from './catalog.repository';
import type {
  CreateParameterInput,
  CreateStructureInput,
  InputTypeInput,
  ParameterValueInput,
  UpdateStructureInput,
} from './payroll.schemas';

function duplicateCode(what: string) {
  return (error: unknown): never => {
    if (pgError(error)?.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictException(`Ya existe ${what} con ese código`);
    }
    throw error;
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}

  listStructures(groupId: string) {
    return this.catalog.listStructures(groupId);
  }

  async getStructure(groupId: string, id: string) {
    const structure = await this.catalog.findStructure(groupId, id);
    if (!structure) throw new NotFoundException('Estructura no encontrada');
    return structure;
  }

  async createStructure(
    groupId: string,
    { rules, ...values }: CreateStructureInput,
  ) {
    const id = await this.catalog
      .createStructure(groupId, values, rules)
      .catch(duplicateCode('una estructura'));
    return this.getStructure(groupId, id);
  }

  async updateStructure(
    groupId: string,
    id: string,
    { rules, ...changes }: UpdateStructureInput,
  ) {
    const found = await this.catalog.updateStructure(
      groupId,
      id,
      changes,
      rules,
    );
    if (!found) throw new NotFoundException('Estructura no encontrada');
    return this.getStructure(groupId, id);
  }

  listParameters(groupId: string) {
    return this.catalog.listParameters(groupId);
  }

  async createParameter(groupId: string, input: CreateParameterInput) {
    await this.catalog
      .createParameter(groupId, input)
      .catch(duplicateCode('un parámetro'));
    return this.catalog.listParameters(groupId);
  }

  async setParameterValue(
    groupId: string,
    parameterId: string,
    { dateFrom, value }: ParameterValueInput,
  ) {
    const found = await this.catalog.setParameterValue(
      groupId,
      parameterId,
      dateFrom,
      value,
    );
    if (!found) throw new NotFoundException('Parámetro no encontrado');
    return this.catalog.listParameters(groupId);
  }

  listInputTypes(groupId: string) {
    return this.catalog.listInputTypes(groupId);
  }

  createInputType(groupId: string, input: InputTypeInput) {
    return this.catalog
      .createInputType(groupId, input)
      .catch(duplicateCode('una entrada'));
  }
}
