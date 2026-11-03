import { checkQuery } from "./sql-guard";

const ok = (sql: string) => expect(checkQuery(sql)).toHaveProperty("sql");
const refused = (sql: string) => expect(checkQuery(sql)).toHaveProperty("error");

describe("checkQuery", () => {
  it("allows a plain select over the ai views, with joins and CTEs", () => {
    ok("SELECT status, COUNT(*) FROM ai_leads GROUP BY status");
    ok("select l.name, a.answer from ai_leads l join ai_lead_answers a on a.lead_no = l.lead_no where l.city = 'Pune' order by l.created_at desc");
    ok("WITH x AS (SELECT * FROM ai_applications) SELECT COUNT(*) FROM x");
    ok("SELECT COUNT(*) FROM ai_leads WHERE created_at > now() - interval '7 days';");
  });

  it("refuses anything that is not a single select", () => {
    refused("DROP TABLE ai_leads");
    refused("UPDATE ai_leads SET name = 'x'");
    refused("SELECT 1; DELETE FROM ai_leads");
    refused("INSERT INTO ai_leads VALUES (1)");
    refused("COPY ai_leads TO '/tmp/x'");
    refused("SET app.officer_id = ''");
  });

  it("refuses the real tables, quoted names and system objects", () => {
    refused('SELECT * FROM "Lead"');
    refused("SELECT * FROM lead");
    refused("SELECT * FROM public.ai_leads");
    refused("SELECT * FROM pg_user");
    refused("SELECT * FROM information_schema.tables");
    refused("SELECT * FROM ai_leads, \"User\"");
    refused("SELECT current_setting('app.officer_id')");
    refused("SELECT set_config('app.officer_id', '', false)");
    refused("SELECT pg_read_file('/etc/passwd')");
  });

  it("refuses comments and an empty query", () => {
    refused("SELECT * FROM ai_leads -- all");
    refused("SELECT /* x */ * FROM ai_leads");
    refused("   ");
  });

  it("does not trip on words inside text values", () => {
    ok("SELECT * FROM ai_leads WHERE notes ILIKE '%update later%' OR source = 'set up call'");
  });
});
