import { Module } from "@nestjs/common";
import { PublicSiteContentController, SiteContentAdminController } from "./site-content.controller";
import { PublicSiteImagesController, SiteImagesAdminController } from "./site-images.controller";

@Module({
  controllers: [
    PublicSiteContentController,
    SiteContentAdminController,
    SiteImagesAdminController,
    PublicSiteImagesController,
  ],
})
export class SiteContentModule {}
