import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

const prisma = global.prismaGlobal ?? (global.prismaGlobal = new PrismaClient());

export default prisma;
