
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const centre = await prisma.centre.upsert({
    where: {
      id: "certiflow-demo-centre"
    },
    update: {},
    create: {
      id: "certiflow-demo-centre",
      name: "Hyderabad Skill Training Centre",
      district: "Hyderabad"
    }
  });

  const passwordHash = await bcrypt.hash("Demo@123", 10);

  const users = [
    {
      name: "Anika",
      email: "anika@certiflow.com",
      role: Role.CENTRE,
      centreId: centre.id
    },
    {
      name: "Dev",
      email: "dev@certiflow.com",
      role: Role.DISTRICT,
      centreId: null
    },
    {
      name: "Meera",
      email: "meera@certiflow.com",
      role: Role.DISTRICT,
      centreId: null
    },
    {
      name: "Neha",
      email: "neha@certiflow.com",
      role: Role.QUALITY,
      centreId: null
    },
    {
      name: "Farah",
      email: "farah@certiflow.com",
      role: Role.STATE,
      centreId: null
    }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: {
        email: user.email
      },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        centreId: user.centreId
      },
      create: {
        ...user,
        passwordHash
      }
    });

    console.log(`Created or updated: ${user.email}`);
  }

  console.log("Demo users are ready");
}

main()
  .catch((error) => {
    console.error(error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
