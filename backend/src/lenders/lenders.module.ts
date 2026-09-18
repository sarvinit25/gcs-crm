import { Module } from "@nestjs/common";
import { LendersController, PublicLendersController } from "./lenders.controller";
import { LoanProductsController } from "./loan-products.controller";
import { LendersService } from "./lenders.service";

@Module({
  controllers: [LendersController, PublicLendersController, LoanProductsController],
  providers: [LendersService],
})
export class LendersModule {}
