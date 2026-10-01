import { Global, Module } from "@nestjs/common";
import { LoginLockService } from "./login-lock.service";

@Global()
@Module({ providers: [LoginLockService], exports: [LoginLockService] })
export class SecurityModule {}
