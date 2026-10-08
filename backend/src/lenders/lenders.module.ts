import { Module } from "@nestjs/common";
import { LendersController, PublicLendersController } from "./lenders.controller";
import { LoanProductsController } from "./loan-products.controller";
import { LendersService } from "./lenders.service";
import { LenderContactsController } from "./lender-contacts.controller";
import { LenderContactsService } from "./lender-contacts.service";

@Module({
  controllers: [LendersController, PublicLendersController, LoanProductsController, LenderContactsController],
  providers: [LendersService, LenderContactsService],
})
export class LendersModule {}
