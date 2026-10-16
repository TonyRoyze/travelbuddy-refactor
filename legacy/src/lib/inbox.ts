import { z } from 'zod';

export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const customPackageSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  price: z.number().finite().positive().max(10000000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use up to two decimal places.'),
  currency: z.enum(['USD', 'LKR']),
  hasVehicle: z.boolean(),
  vehicleDetails: z.string().trim().max(120).optional(),
}).strict().superRefine((value, context) => {
  if (value.hasVehicle && !value.vehicleDetails) context.addIssue({ code: 'custom', path: ['vehicleDetails'], message: 'Describe your vehicle.' });
  if (!value.hasVehicle && value.vehicleDetails) context.addIssue({ code: 'custom', path: ['vehicleDetails'], message: 'Remove vehicle details when no vehicle is available.' });
});
export type CustomPackage = z.infer<typeof customPackageSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
export function distanceKm(first: Coordinates, second: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(second.latitude - first.latitude);
  const deltaLng = radians(second.longitude - first.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}
