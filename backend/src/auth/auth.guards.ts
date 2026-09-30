import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import type { CanActivate } from "@nestjs/common";
import type { Role } from "@prisma/client";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./auth.decorators";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Your role does not have access to this action");
    }
    return true;
  }
}

/**
 * While a password change is required (new account, or a password an admin
 * issued), the only things a session may do are check who it is and change it.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  private static readonly ALLOWED = ["/auth/me", "/auth/change-password"];

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.user?.mustChangePassword) return true;
    if (PasswordChangeGuard.ALLOWED.some((p) => String(req.path).endsWith(p))) return true;
    throw new ForbiddenException({ code: "PASSWORD_CHANGE_REQUIRED", message: "Choose a new password before continuing" });
  }
}
