import { Module } from "@nestjs/common";
import { ApiUsageController } from "./api-usage.controller";
import { ApiUsageService } from "./api-usage.service";

@Module({
  controllers: [ApiUsageController],
  providers: [ApiUsageService],
})
export class ApiUsageModule {}
