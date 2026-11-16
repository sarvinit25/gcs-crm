import { Module } from "@nestjs/common";
import { TelephonyModule } from "../telephony/telephony.module";
import { ApiUsageController } from "./api-usage.controller";
import { ApiUsageService } from "./api-usage.service";

@Module({
  imports: [TelephonyModule],
  controllers: [ApiUsageController],
  providers: [ApiUsageService],
})
export class ApiUsageModule {}
