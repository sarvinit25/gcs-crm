import { Controller, Get, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { DirectoryQuery } from "./dto/id-directory.dto";
import { IdDirectoryService } from "./id-directory.service";

/** Every GCS reference in one list. Only the main admin can open it. */
@Controller("id-directory")
@Roles(Role.ADMIN)
export class IdDirectoryController {
  constructor(private directory: IdDirectoryService) {}

  @Get("summary")
  summary() {
    return this.directory.summary();
  }

  @Get()
  list(@Query() query: DirectoryQuery) {
    return this.directory.list(query);
  }
}
