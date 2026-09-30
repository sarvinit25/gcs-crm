import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class BorrowerAuthGuard extends AuthGuard("jwt-borrower") {}
