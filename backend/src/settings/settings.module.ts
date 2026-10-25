import { Global, Module } from "@nestjs/common";
import {
  PublicRateCardController,
  PublicSettingsController,
  RateCardAdminController,
  SettingsController,
} from "./settings.controller";
import { SettingsService } from "./settings.service";

// Global: settings drive behaviour in most modules, and threading this through
// every module's imports adds noise without adding clarity.
@Global()
@Module({
  controllers: [
    SettingsController,
    PublicSettingsController,
    PublicRateCardController,
      RateCardAdminController,
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
