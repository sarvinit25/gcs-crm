import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** What PartnerJwtStrategy.validate() attaches to the request as req.user. */
export type PartnerAuthUser = { id: string; name: string; phone: string; type: "partner" };

export const CurrentPartner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PartnerAuthUser => ctx.switchToHttp().getRequest().user,
);
