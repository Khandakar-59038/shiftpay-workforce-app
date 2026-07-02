import { prisma } from "./db";

/** Fetch the singleton company settings row, creating defaults if missing. */
export async function getSettings() {
  return prisma.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}
