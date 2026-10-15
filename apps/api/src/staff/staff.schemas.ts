import { z } from 'zod';
import { passwordSchema, personNameSchema } from '../common/schemas';

const staffRole = z.enum(['admin', 'analyst']);
const companyIds = z.array(z.uuid()).max(100);

export const createStaffSchema = z.object({
  name: personNameSchema,
  email: z.email().trim().toLowerCase(),
  password: passwordSchema,
  role: staffRole,
  companyIds: companyIds.min(1, 'Asigna al menos una empresa'),
});

export const updateStaffSchema = z
  .object({
    name: personNameSchema,
    role: staffRole,
    active: z.boolean(),
    password: passwordSchema,
    companyIds,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
