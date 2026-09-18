import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("lenders")
export class LendersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.lender.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true },
      orderBy: { sortOrder: "asc" },
    });
  }
}
