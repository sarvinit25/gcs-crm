import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  find(@Query("q") q: string | undefined, @Query("limit") limit: string | undefined, @CurrentUser() user: AuthUser) {
    return this.search.search(q ?? "", Math.min(Math.max(Number(limit) || 6, 1), 50), user);
  }
}
