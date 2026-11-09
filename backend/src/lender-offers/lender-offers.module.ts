import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { LenderPoliciesModule } from "../lender-policies/lender-policies.module";
import { LenderOffersController } from "./lender-offers.controller";
import { LenderOffersService } from "./lender-offers.service";
import { OfferReaderService } from "./offer-reader.service";

@Module({
  imports: [DocumentsModule, LenderPoliciesModule],
  controllers: [LenderOffersController],
  providers: [LenderOffersService, OfferReaderService],
})
export class LenderOffersModule {}
