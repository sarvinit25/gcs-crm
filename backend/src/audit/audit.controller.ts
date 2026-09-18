import { Controller, Get, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { AuditService } from "./audit.service";

@Controller("audit")
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  findAll(
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.audit.findAll({
      entity,
      entityId,
      actorId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
