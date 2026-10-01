import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from "@nestjs/common";

export const MAX_TEXT_LENGTH = 5_000;
export const MAX_NUMBER = 1e13;
const MAX_DEPTH = 8;
const MAX_ARRAY = 5_000;

/**
 * A blanket ceiling under every field of every request, so a form with no
 * explicit limit of its own (or a future one added in a hurry) still can't be
 * used to push megabytes of text, absurd amounts or deeply nested junk into the
 * database. Per-field @Length rules stay stricter where they exist.
 */
@Injectable()
export class InputCeilingPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === "custom") return value;
    this.walk(value, metadata.data ?? metadata.type, 0);
    return value;
  }

  private walk(value: unknown, path: string, depth: number) {
    if (typeof value === "string") {
      if (value.length > MAX_TEXT_LENGTH) throw new BadRequestException(`${path} is too long (limit ${MAX_TEXT_LENGTH} characters)`);
    } else if (typeof value === "number") {
      if (Math.abs(value) > MAX_NUMBER) throw new BadRequestException(`${path} is out of range`);
    } else if (Array.isArray(value)) {
      if (depth >= MAX_DEPTH) throw new BadRequestException(`${path} is nested too deeply`);
      if (value.length > MAX_ARRAY) throw new BadRequestException(`${path} has too many items`);
      value.forEach((v, i) => this.walk(v, `${path}[${i}]`, depth + 1));
    } else if (value && typeof value === "object") {
      if (depth >= MAX_DEPTH) throw new BadRequestException(`${path} is nested too deeply`);
      for (const [k, v] of Object.entries(value)) this.walk(v, `${path}.${k}`, depth + 1);
    }
  }
}
