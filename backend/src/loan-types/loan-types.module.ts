import { Module } from "@nestjs/common";
import { LoanTypesController } from "./loan-types.controller";
import { LoanTypesService } from "./loan-types.service";

@Module({ controllers: [LoanTypesController], providers: [LoanTypesService] })
export class LoanTypesModule {}
