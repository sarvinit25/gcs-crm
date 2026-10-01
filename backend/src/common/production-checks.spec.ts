import { productionProblems } from "./production-checks";

const good = {
  NODE_ENV: "production",
  JWT_SECRET: "a3f9c1d8e47b2a6f5c0d9e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f",
  SECRETS_ENCRYPTION_KEY: "b7e2d4f6a8c0e1d3b5a79f8e6d4c2b0a1f3e5d7c9b8a6f4e2d0c1b3a5e7f9d8c",
  TURNSTILE_SECRET: "0x4AAAA",
  B2_KEY_ID: "k",
  B2_APP_KEY: "a",
  B2_BUCKET: "b",
  DATABASE_URL: "postgresql://u:p@db.internal:5432/gcs",
  CORS_ORIGIN: "https://growthcapitalservices.in",
};

describe("production configuration checks", () => {
  it("does nothing outside production", () => {
    expect(productionProblems({ NODE_ENV: "development", JWT_SECRET: "x" })).toEqual([]);
  });

  it("accepts a sound configuration", () => {
    expect(productionProblems(good)).toEqual([]);
  });

  it("rejects short and placeholder secrets", () => {
    expect(productionProblems({ ...good, JWT_SECRET: "short" }).join()).toMatch(/32 characters/);
    expect(productionProblems({ ...good, JWT_SECRET: "please-change-me-please-change-me-please-change-me" }).join()).toMatch(/placeholder/);
  });

  it("requires a separate key for encrypting two-step login secrets", () => {
    expect(productionProblems({ ...good, SECRETS_ENCRYPTION_KEY: "" }).join()).toMatch(/SECRETS_ENCRYPTION_KEY/);
    expect(productionProblems({ ...good, SECRETS_ENCRYPTION_KEY: "short" }).join()).toMatch(/32 characters/);
    expect(productionProblems({ ...good, SECRETS_ENCRYPTION_KEY: good.JWT_SECRET }).join()).toMatch(/differ/);
  });

  it("requires captcha and document storage keys", () => {
    const problems = productionProblems({ ...good, TURNSTILE_SECRET: "", B2_APP_KEY: "" }).join();
    expect(problems).toMatch(/TURNSTILE_SECRET/);
    expect(problems).toMatch(/B2_KEY_ID/);
  });

  it("flags a localhost database and CORS origin unless told otherwise", () => {
    expect(productionProblems({ ...good, DATABASE_URL: "postgresql://u:p@localhost:5432/x" }).join()).toMatch(/localhost/);
    expect(productionProblems({ ...good, DATABASE_URL: "postgresql://u:p@localhost:5432/x", ALLOW_LOCAL_DATABASE: "true" })).toEqual([]);
    expect(productionProblems({ ...good, CORS_ORIGIN: "http://localhost:5173" }).join()).toMatch(/CORS_ORIGIN/);
  });
});
