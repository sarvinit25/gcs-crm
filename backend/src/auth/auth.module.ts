import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        // Cast: jsonwebtoken types expiresIn as a literal duration union, not plain string.
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN", "12h") as `${number}h` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule exported so the partner-portal module can sign tokens with the
  // same secret/config without repeating the registerAsync setup.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
