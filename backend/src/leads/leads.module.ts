import { Module } from "@nestjs/common";
import { LeadsController, PublicLeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { TurnstileService } from "./turnstile.service";

@Module({
  controllers: [LeadsController, PublicLeadsController],
  providers: [LeadsService, TurnstileService],
  exports: [LeadsService],
})
export class LeadsModule {}
