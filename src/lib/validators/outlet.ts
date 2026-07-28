import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const coord = (min: number, max: number, label: string) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} is out of range` });
        return z.NEVER;
      }
      return n;
    });

export const outletSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  address: optionalTrimmed,
  latitude: coord(-90, 90, "Latitude"),
  longitude: coord(-180, 180, "Longitude"),
  isPrimary: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === true),
});

export type OutletInput = z.infer<typeof outletSchema>;
