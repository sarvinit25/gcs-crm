import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Public, Roles } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateChecklistDocumentDto,
  UpdateChecklistDocumentDto,
} from "./dto/checklist-document.dto";

/** The list of downloadable checklist PDFs, open to the marketing website. */
@Controller("public/checklist-documents")
export class PublicChecklistDocumentsController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  findAll() {
    return this.prisma.checklistDocument.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, title: true, productSlug: true, variant: true, fileUrl: true },
    });
  }
}

/** Staff manage the website's checklist PDFs from Settings. */
@Controller("settings/checklist-documents")
export class ChecklistDocumentsAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll() {
    return this.prisma.checklistDocument.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateChecklistDocumentDto) {
    return this.prisma.checklistDocument.create({ data: dto });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateChecklistDocumentDto) {
    return this.prisma.checklistDocument.update({ where: { id }, data: dto });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string) {
    return this.prisma.checklistDocument.delete({ where: { id } });
  }
}
