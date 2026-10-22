import { z } from 'zod';

export const accountDataSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(['traveler', 'provider', 'guide', 'admin'])).min(1)
    .refine(roles => new Set(roles).size === roles.length, 'Roles must be unique'),
  status: z.enum(['active', 'suspended', 'closed']),
  onboarding: z.enum(['pending', 'completed']),
  avatarUrl: z.string().url().max(2048).optional(),
  avatarMediaId: z.string().uuid().nullable().default(null),
  profileVideoIds: z.array(z.string().uuid()).max(3).default([]),
  profileDetails: z.object({
    bio: z.string().trim().max(500).default(''),
    homeBase: z.string().trim().max(120).default(''),
    languages: z.string().trim().max(160).default(''),
    interests: z.string().trim().max(240).default(''),
    travelStyle: z.string().trim().max(120).default(''),
    specialties: z.string().trim().max(240).default(''),
    yearsExperience: z.number().int().min(0).max(80).nullable().default(null),
  }).default({}),
}).strict();

export type AccountData = z.infer<typeof accountDataSchema>;

export function newTravelerData(displayName: string): AccountData {
  return accountDataSchema.parse({ displayName, roles: ['traveler'], status: 'active', onboarding: 'pending' });
}
