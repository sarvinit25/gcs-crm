import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  /** Gives the connections back when the app closes — otherwise each closed test app (or a restart) leaves a pool open. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
