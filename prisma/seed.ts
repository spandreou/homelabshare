import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg(
  new Pool({
    connectionString,
  }),
);

const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  await prisma.inviteCode.deleteMany({
    where: { code: "WELCOME2026" },
  });

  if (adminEmail) {
    await prisma.user.updateMany({
      where: { email: adminEmail },
      data: { role: UserRole.ADMIN },
    });
  }

  console.log("Seed complete: admin role sync finished.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
