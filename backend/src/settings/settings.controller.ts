import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put } from "@nestjs/common";
import { AuditAction, Role } from "@prisma/client";
import { Allow, IsBoolean, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { SettingsService } from "./settings.service";
import { SETTING_GROUPS } from "./settings.registry";

class UpdateSettingDto {
  // Any of the registry's value shapes; the service coerces and validates per
  // setting type. @Allow keeps the whitelisting pipe from stripping it.
  @Allow()
  value: unknown;
}

class CreateProductDto {
  @IsString() @Length(2, 120) name: string;
  @IsString() @Length(2, 120) slug: string;
  @IsOptional() @IsString() @Length(0, 80) category?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 80) category?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

/** Organisation details the public website may read. */
@Controller("public/settings")
export class PublicSettingsController {
  constructor(private settings: SettingsService) {}

  @Public()
  @Get()
  publicValues() {
    return this.settings.publicValues();
  }
}

@Controller("settings")
export class SettingsController {
  constructor(
    private settings: SettingsService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  all() {
    return { groups: SETTING_GROUPS, settings: this.settings.all() };
  }

  @Put(":key")
  @Roles(Role.ADMIN)
  update(
    @Param("key") key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.settings.update(key, dto.value, user, ip);
  }

  @Delete(":key")
  @Roles(Role.ADMIN)
  reset(@Param("key") key: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.settings.reset(key, user, ip);
  }
}

/** Loan products are master data the Settings screen owns. */
@Controller("settings/loan-products")
export class LoanProductsAdminController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  async findAll() {
    const products = await this.prisma.loanProduct.findMany({ orderBy: { sortOrder: "asc" } });
    const counts = await this.prisma.application.groupBy({
      by: ["loanProductId"],
      _count: { _all: true },
      orderBy: { loanProductId: "asc" },
    });
    const used = new Map(counts.map((c) => [c.loanProductId, c._count._all]));
    return products.map((p) => ({ ...p, applicationCount: used.get(p.id) ?? 0 }));
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    const product = await this.prisma.loanProduct.create({ data: { ...dto } });
    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "LoanProduct",
      entityId: product.id,
      entityLabel: product.name,
      ip,
    });
    return product;
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    const before = await this.prisma.loanProduct.findUniqueOrThrow({ where: { id } });
    const product = await this.prisma.loanProduct.update({ where: { id }, data: { ...dto } });
    await this.audit.recordUpdate({
      actor: user,
      entity: "LoanProduct",
      entityId: id,
      entityLabel: product.name,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });
    return product;
  }
}
