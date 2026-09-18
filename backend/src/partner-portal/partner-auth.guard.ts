import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class PartnerAuthGuard extends AuthGuard("jwt-partner") {}
