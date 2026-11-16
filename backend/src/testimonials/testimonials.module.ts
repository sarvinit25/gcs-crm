import { Module } from "@nestjs/common";
import { PublicTestimonialsController, TestimonialSubmissionsController } from "./testimonials.controller";
import { TestimonialsService } from "./testimonials.service";

@Module({
  controllers: [PublicTestimonialsController, TestimonialSubmissionsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
