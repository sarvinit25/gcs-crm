import { Module } from "@nestjs/common";
import { LendersController } from "./lenders.controller";
import { LoanProductsController } from "./loan-products.controller";

@Module({ controllers: [LendersController, LoanProductsController] })
export class LendersModule {}
