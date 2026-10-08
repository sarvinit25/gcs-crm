import { Module } from "@nestjs/common";
import { PublicSiteContentController, SiteContentAdminController } from "./site-content.controller";

@Module({ controllers: [PublicSiteContentController, SiteContentAdminController] })
export class SiteContentModule {}
