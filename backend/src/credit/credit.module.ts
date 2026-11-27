import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { CreditController } from "./credit.controller";
import { CreditService } from "./credit.service";

@Module({ imports: [DocumentsModule], controllers: [CreditController], providers: [CreditService] })
export class CreditModule {}
