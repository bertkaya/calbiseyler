import { z } from "zod";
import { body, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { saveTheme } from "@/lib/server/repo";
import { themeDefaults } from "@/lib/taste/theme";

export const runtime = "nodejs";

export const PUT = route(async (req: Request) => {
  const userId = await requireUser();
  const b = await body(req, z.object({
    statement: z.string().min(1).max(300),
    principles: z.array(z.string().max(200)).max(8).default([]),
    discovery: z.number().min(0).max(100).nullable().default(null),
  }));
  const theme = await saveTheme(userId, b);
  return json({ theme, appliedDefaults: themeDefaults(theme) });
});
