import { productionProblems } from "./production-checks";

const good = {
  NODE_ENV: "production",
  JWT_SECRET: "a3f9c1d8e47b2a6f5c0d9e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f",
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
