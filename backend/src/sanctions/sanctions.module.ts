import { Module } from "@nestjs/common";
import { ApplicationSanctionController, SanctionsController } from "./sanctions.controller";
import { SanctionsService } from "./sanctions.service";

@Module({
  controllers: [SanctionsController, ApplicationSanctionController],
  providers: [SanctionsService],
  exports: [SanctionsService],
})
export class SanctionsModule {}
