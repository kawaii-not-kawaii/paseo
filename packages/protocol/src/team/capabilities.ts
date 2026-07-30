import { z } from "zod";

export const TeamServerFeaturesSchema = z.object({
  // COMPAT(team): added in v0.2.3, drop the gate when floor >= v0.2.3
  team: z.boolean().optional(),
  // COMPAT(teamChannelReads): added in v0.2.3, drop the gate when floor >= v0.2.3
  teamChannelReads: z.boolean().optional(),
});

export type TeamServerFeatures = z.infer<typeof TeamServerFeaturesSchema>;
