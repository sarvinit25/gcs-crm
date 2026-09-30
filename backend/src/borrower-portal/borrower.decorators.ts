import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** What BorrowerJwtStrategy.validate() attaches to the request as req.user. */
export type BorrowerAuthUser = { id: string; type: "borrower" };

export const CurrentBorrower = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BorrowerAuthUser => ctx.switchToHttp().getRequest().user,
);
