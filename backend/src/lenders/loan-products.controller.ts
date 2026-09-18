import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("loan-products")
export class LoanProductsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.loanProduct.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true, category: true },
      orderBy: { sortOrder: "asc" },
    });
  }
}
