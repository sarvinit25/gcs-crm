import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type Team = { id: string; name: string; active: boolean; lead: { id: string; name: string } | null; members: { id: string; name: string }[] };

/** Teams, and the four switches that decide who gets a new lead and what the lead list shows. */
describe("teams", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t?: string) => http.get(`${API}${p}`).set(t ? as(t) : {});
  const send = (m: "post" | "patch" | "delete" | "put", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);
  const setting = (key: string, value: boolean) => send("put", `/settings/${key}`, admin, { value });
  const advisor = async (n: number) =>
    (await send("post", "/team", admin, { name: `Team Tester ${n}`, email: `team.tester${n}@example.com`, phone: `90000667${n}0`, role: "ADVISOR", password: "StaffPass#12345" })).body.id as string;
  const lead = async (phone: string, extra: object = {}) => send("post", "/leads", admin, { name: "Routing Probe", phone, source: "manual-entry", ...extra });
  const officerOf = async (id: string) => (await get(`/leads/${id}`, admin)).body.assignedOfficer?.id ?? null;

  let a: string, b: string, c: string;
  let team: Team;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
    [a, b, c] = [await advisor(1), await advisor(2), await advisor(3)];
  });
  afterAll(async () => {
    await setting("teams.autoAssignCases", false);
    await setting("teams.routeToTeamLead", false);
    await app?.close();
  });

  it("makes a team with a lead and members; the lead is always a member, and a person works in one team", async () => {
    const made = await send("post", "/teams", admin, { name: "Mumbai Sales", leadId: a, memberIds: [b] });
    expect(made.status).toBe(201);
    team = made.body;
    expect(team.lead!.id).toBe(a);
    expect(team.members.map((m) => m.id).sort()).toEqual([a, b].sort());

    // Moving b to a second team takes b out of the first.
    const other = await send("post", "/teams", admin, { name: "Pune Sales", leadId: c, memberIds: [b] });
    expect(other.status).toBe(201);
    const teams = (await get("/teams", admin)).body as Team[];
    expect(teams.find((t) => t.id === team.id)!.members.map((m) => m.id)).toEqual([a]);
    // Put b back for the tests below, and drop the second team.
    await send("patch", `/teams/${team.id}`, admin, { memberIds: [a, b] });
    expect((await send("delete", `/teams/${other.body.id}`, admin)).status).toBe(200);
    expect(((await get("/teams", admin)).body as Team[]).find((t) => t.id === team.id)!.members).toHaveLength(2);
    // c left with the deleted team.
    expect(((await get("/teams", admin)).body as Team[]).some((t) => t.members.some((m) => m.id === c))).toBe(false);
  });

  it("refuses a duplicate name and a person who does not exist", async () => {
    expect((await send("post", "/teams", admin, { name: "Mumbai Sales" })).status).toBe(409);
    expect((await send("post", "/teams", admin, { name: "Ghost Team", memberIds: ["nobody"] })).status).toBe(400);
  });

  it("auto case assignment hands new website leads out in turn among the team, and is off by default", async () => {
    const before = await send("post", "/public/leads", admin, { name: "Web Probe One", phone: "9811200001", source: "contact-form" });
    expect(await officerOf(before.body.id)).toBeNull();

    await setting("teams.autoAssignCases", true);
    const owners: (string | null)[] = [];
    for (const [i, name] of ["Two", "Three", "Four"].entries()) {
      const res = await send("post", "/public/leads", admin, { name: `Web Probe ${name}`, phone: `981120000${i + 2}`, source: "contact-form" });
      owners.push(await officerOf(res.body.id));
    }
    expect(owners[0]).not.toBeNull();
    expect(new Set([owners[0], owners[1]]).size).toBe(2);
    expect(owners[2]).toBe(owners[0]);
    expect(owners.every((o) => o === a || o === b)).toBe(true);
    await setting("teams.autoAssignCases", false);
  });

  it("team routing gives a partner's lead to the lead of the team their manager works in", async () => {
    const partner = await send("post", "/partners", admin, { name: "Routing Partner", phone: "9000066601", commissionRate: 20, managerId: b });
    expect(partner.status).toBe(201);
    const off = await lead("9811200010", { sourcingPartnerId: partner.body.id });
    expect(await officerOf(off.body.id)).toBeNull();

    await setting("teams.routeToTeamLead", true);
    const on = await lead("9811200011", { sourcingPartnerId: partner.body.id });
    expect(await officerOf(on.body.id)).toBe(a);
    await setting("teams.routeToTeamLead", false);
  });

  it("auto file assignment gives a file to the lead's owner, unless it is switched off", async () => {
    const owned = await lead("9811200020", { assignedOfficerId: b });
    const product = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
    const file = await send("post", "/applications", admin, { leadId: owned.body.id, loanProductId: product, requestedAmount: 500000 });
    expect(file.status).toBe(201);
    expect(file.body.owner?.id ?? file.body.ownerId).toBe(b);

    await setting("teams.autoAssignFiles", false);
    const owned2 = await lead("9811200021", { assignedOfficerId: b });
    const file2 = await send("post", "/applications", admin, { leadId: owned2.body.id, loanProductId: product, requestedAmount: 500000 });
    expect(file2.body.owner?.id ?? file2.body.ownerId).not.toBe(b);
    await setting("teams.autoAssignFiles", true);
  });

  it("hides converted and lost leads from the list when switched on, unless a status is picked", async () => {
    const l = await lead("9811200030");
    await send("patch", `/leads/${l.body.id}`, admin, { status: "LOST", lostReason: "Went elsewhere" });
    const ids = async (q = "") => ((await get(`/leads?pageSize=100${q}`, admin)).body.items as { id: string }[]).map((x) => x.id);
    expect(await ids()).toContain(l.body.id); // off by default: closed leads stay listed until archived
    await setting("teams.hideClosedLeads", true);
    expect(await ids()).not.toContain(l.body.id);
    expect(await ids("&status=LOST")).toContain(l.body.id);
    await setting("teams.hideClosedLeads", false);
  });

  it("is for admins: staff cannot manage teams", async () => {
    const staff = await signIn(
      (path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body),
      "team.tester1@example.com",
      "StaffPass#12345",
    );
    expect((await get("/teams", staff)).status).toBe(403);
    expect((await send("post", "/teams", staff, { name: "Nope" })).status).toBe(403);
  });
});
