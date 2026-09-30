/**
 * Refuses to start in production with settings that would quietly make the
 * system unsafe — better a loud failure on deploy than a weak secret for years.
 */
export function productionProblems(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];

  const jwt = env.JWT_SECRET ?? "";
  if (jwt.length < 32) problems.push("JWT_SECRET must be at least 32 characters (try: openssl rand -hex 48)");
  if (/change.?me|secret|password|example|dev/i.test(jwt)) problems.push("JWT_SECRET looks like a placeholder — generate a real one");

  if (!env.TURNSTILE_SECRET) problems.push("TURNSTILE_SECRET is required — the public lead form would be unprotected");
  if (!env.B2_KEY_ID || !env.B2_APP_KEY || !env.B2_BUCKET) problems.push("B2_KEY_ID, B2_APP_KEY and B2_BUCKET are required — documents would have nowhere to go");
  if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL ?? "") && !env.ALLOW_LOCAL_DATABASE) {
    problems.push("DATABASE_URL points at localhost — set ALLOW_LOCAL_DATABASE=true if the database really is on this server");
  }
  if ((env.CORS_ORIGIN ?? "").includes("localhost")) problems.push("CORS_ORIGIN still allows localhost");
  return problems;
}

export function assertProductionConfig(env: Record<string, string | undefined> = process.env) {
  const problems = productionProblems(env);
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n - ${problems.join("\n - ")}`);
  }
}
