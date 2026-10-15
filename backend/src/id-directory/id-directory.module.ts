import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { IdDirectoryController } from "./id-directory.controller";
import { IdDirectoryService } from "./id-directory.service";

@Module({
  imports: [SettingsModule],
  controllers: [IdDirectoryController],
  providers: [IdDirectoryService],
})
export class IdDirectoryModule {}
