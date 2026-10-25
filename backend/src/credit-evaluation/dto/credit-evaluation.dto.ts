import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

const money = 100_000_000_000;

/** The figures a credit evaluation needs beyond what the file already holds. An emptied box goes as null. */
export class UpdateCreditEvaluationDto {
  @IsOptional() @IsNumber() @Min(0) @Max(money) loanAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) proposedRate?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) tenureMonths?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) monthlyIncome?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) annualTurnover?: number | null;
  @IsOptional() @IsNumber() @Min(-money) @Max(money) netProfit?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) depreciation?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) interestPaid?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) avgMonthlyBankCredits?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) gstAnnualTurnover?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) propertyValue?: number | null;
  @IsOptional() @IsString() @Length(0, 2000) remarks?: string | null;
}

export class ExistingLoanDto {
  @IsString() @Length(2, 120) lenderName: string;
  @IsOptional() @IsString() @Length(0, 60) loanType?: string | null;
  @IsOptional() @IsString() applicantId?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) outstanding?: number | null;
  @IsNumber() @Min(0) @Max(money) emi: number;
  @IsOptional() @IsInt() @Min(0) @Max(600) monthsLeft?: number | null;
  @IsOptional() @IsBoolean() counted?: boolean;
  @IsOptional() @IsString() @Length(0, 300) note?: string | null;
}

export class UpdateExistingLoanDto {
  @IsOptional() @IsString() @Length(2, 120) lenderName?: string;
  @IsOptional() @IsString() @Length(0, 60) loanType?: string | null;
  @IsOptional() @IsString() applicantId?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) outstanding?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(money) emi?: number;
  @IsOptional() @IsInt() @Min(0) @Max(600) monthsLeft?: number | null;
  @IsOptional() @IsBoolean() counted?: boolean;
  @IsOptional() @IsString() @Length(0, 300) note?: string | null;
}

export class CreditDecisionDto {
  @IsIn(["READY", "REJECTED"]) decision: "READY" | "REJECTED";
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
  /** Needed to clear a file that still has a failed check. */
  @IsOptional() @IsBoolean() acknowledgeRisks?: boolean;
}
