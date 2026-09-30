import { Module } from "@nestjs/common";
import { EducationLoanDetailController } from "./education-loan-detail.controller";
import { EducationLoanDetailService } from "./education-loan-detail.service";

@Module({
  controllers: [EducationLoanDetailController],
  providers: [EducationLoanDetailService],
})
export class EducationLoanDetailModule {}
