import { Module } from "@nestjs/common";
import { LeadSourcesModule } from "../lead-sources/lead-sources.module";
import { MarketingController } from "./marketing.controller";
import { MarketingService } from "./marketing.service";

@Module({ imports: [LeadSourcesModule], controllers: [MarketingController], providers: [MarketingService] })
export class MarketingModule {}
