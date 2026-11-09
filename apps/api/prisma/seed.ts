import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set SEED_PASSWORD (at least 12 characters). No default production password is created.",
    );
  const user = await db.user.upsert({
    where: { email: "pelumi@marpel.dev" },
    create: {
      name: "Pelumi Martins",
      email: "pelumi@marpel.dev",
      passwordHash: await hash(password, 12),
    },
    update: {},
  });
  await db.workSpace.upsert({
    where: { slug: "marpel-studio" },
    create: {
      name: "Marpel Studio",
      slug: "marpel-studio",
      ownerId: user.id,
      members: { create: { userId: user.id, role: "owner" } },
    },
    update: {},
  });
  console.log("Workspace seeded. Sign in with the configured SEED_PASSWORD.");
}
seed().finally(() => db.$disconnect());
