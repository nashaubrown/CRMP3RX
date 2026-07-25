import { z } from "zod";

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const geofenceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    type: z.enum(["TERRITORY", "CAMPAIGN"]),
    shape: z.enum(["POLYGON", "CIRCLE"]),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Pick a color")
      .default("#16a34a"),
    points: z.array(latLng).min(1, "Draw the zone on the map"),
    radiusM: z.number().int().positive().max(200_000).nullable().optional(),
    offer: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v === "" ? null : (v ?? null))),
    ownerId: z
      .string()
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
  })
  .superRefine((v, ctx) => {
    if (v.shape === "POLYGON" && v.points.length < 3) {
      ctx.addIssue({ code: "custom", path: ["points"], message: "A polygon needs at least 3 points" });
    }
    if (v.shape === "CIRCLE" && (!v.radiusM || v.points.length !== 1)) {
      ctx.addIssue({ code: "custom", path: ["radiusM"], message: "A circle needs a center and radius" });
    }
  });

export type GeofenceInput = z.infer<typeof geofenceSchema>;
