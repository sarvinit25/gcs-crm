import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { DocumentTypesService } from "./document-types.service";
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from "./dto/document-type.dto";

/** Admin screen for the documents a case can need. Per-file Given/Pending lives under /applications/:id/checklist. */
@Controller("document-types")
export class DocumentTypesController {
  constructor(private types: DocumentTypesService) {}

  /** The folders documents are filed under; every signed-in user needs them to upload. */
  @Get("categories")
  categories() {
    return this.types.categories();
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  list() {
    return this.types.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateDocumentTypeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateDocumentTypeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.remove(id, user, ip);
  }
}
