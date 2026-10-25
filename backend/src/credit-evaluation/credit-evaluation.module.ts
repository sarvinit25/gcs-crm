import { Module } from "@nestjs/common";
import { ChecklistModule } from "../checklist/checklist.module";
import { CreditEvaluationController } from "./credit-evaluation.controller";
import { CreditEvaluationService } from "./credit-evaluation.service";

@Module({ imports: [ChecklistModule], controllers: [CreditEvaluationController], providers: [CreditEvaluationService] })
export class CreditEvaluationModule {}
