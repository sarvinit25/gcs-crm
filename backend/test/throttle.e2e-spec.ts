import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";

describe("brute-force protection", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ throttle: true });
  });
  afterAll(async () => {
    await app?.close();
  });

  it("slows repeated wrong passwords, and the code step too", async () => {
    const http = request(app.getHttpServer());
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await http.post("/crm/api/auth/login").send({ email: "nobody@example.com", password: "wrong-password" })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      codes.push((await http.post("/crm/api/auth/2fa/verify").send({ challengeToken: "x.y.z", code: "000000" })).status);
    }
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});
