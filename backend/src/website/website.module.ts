import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { LeadsModule } from "../leads/leads.module";
import { AdsController, PublicAdController } from "./ads.controller";
import { AdsService } from "./ads.service";
import { WebsiteController } from "./website.controller";
import { WebsiteService } from "./website.service";

@Module({
  imports: [DocumentsModule, LeadsModule],
  controllers: [WebsiteController, AdsController, PublicAdController],
  providers: [WebsiteService, AdsService],
})
export class WebsiteModule {}
