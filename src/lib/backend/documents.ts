import { z } from 'zod';

export const accountDataSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(['traveler', 'provider', 'guide', 'admin'])).min(1)
    .refine(roles => new Set(roles).size === roles.length, 'Roles must be unique'),
  status: z.enum(['active', 'suspended', 'closed']),
  onboarding: z.enum(['pending', 'completed']),
  avatarUrl: z.string().url().max(2048).optional(),
}).strict();

export const googleIdentityDataSchema = z.object({
  accountId: z.string().uuid(),
  provider: z.literal('google'),
  providerSubject: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320),
  emailVerified: z.boolean(),
}).strict();

export type AccountData = z.infer<typeof accountDataSchema>;
export type GoogleIdentityData = z.infer<typeof googleIdentityDataSchema>;

export function newTravelerData(displayName: string): AccountData {
  return accountDataSchema.parse({ displayName, roles: ['traveler'], status: 'active', onboarding: 'pending' });
}
