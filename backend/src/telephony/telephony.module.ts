import { Module } from "@nestjs/common";
import { PlivoClient } from "./plivo.client";
import { TelephonyController } from "./telephony.controller";

@Module({
  controllers: [TelephonyController],
  providers: [PlivoClient],
  exports: [PlivoClient],
})
export class TelephonyModule {}
