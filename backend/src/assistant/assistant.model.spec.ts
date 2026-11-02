import { ModelUnavailableError, OpenAiAssistantModel, type ToolSpec } from "./assistant.model";

const TOOLS: ToolSpec[] = [
  { type: "function", function: { name: "count_files", description: "d", parameters: { type: "object", properties: {} } } },
];
const ok = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

describe("OpenAiAssistantModel", () => {
  const saved = { key: process.env.OPENAI_API_KEY, model: process.env.ASSISTANT_MODEL };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.ASSISTANT_MODEL;
    fetchSpy = jest.spyOn(global, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.key;
    if (saved.model === undefined) delete process.env.ASSISTANT_MODEL;
    else process.env.ASSISTANT_MODEL = saved.model;
  });

  it("is only 'configured' when a key is set", () => {
    const model = new OpenAiAssistantModel();
    expect(model.configured).toBe(true);
    delete process.env.OPENAI_API_KEY;
    expect(model.configured).toBe(false);
  });

  it("refuses to call out without a key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS)).rejects.toBeInstanceOf(
      ModelUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the conversation and tools with the key, and returns the assistant's turn", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({ content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "count_files", arguments: "{}" } }] }),
    );
    const turn = await new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS);

    expect(turn.tool_calls?.[0].function.name).toBe("count_files");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4.1");
    expect(body.tools).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("uses the model named in the environment", async () => {
    process.env.ASSISTANT_MODEL = "gpt-4.1-mini";
    fetchSpy.mockResolvedValueOnce(ok({ content: "hello" }));
    await new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body as string).model).toBe("gpt-4.1-mini");
  });

  it.each([
    [401, /key was refused/],
    [429, /busy or out of credit/],
    [500, /returned 500/],
  ])("turns an OpenAI %s into a plain message, without retrying", async (status, message) => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "x", message: "secret echo" } }), { status }));
    const err = await new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS).catch((e) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.message).toMatch(message);
    // Nothing the provider echoed back leaks into the message shown to the user.
    expect(err.message).not.toMatch(/secret echo/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection once, then gives up", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(ok({ content: "back" }));
    expect((await new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS)).content).toBe("back");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error("down"));
    await expect(new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS)).rejects.toThrow(/Could not reach/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("reports an empty answer rather than returning nothing", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(new OpenAiAssistantModel().complete([{ role: "user", content: "hi" }], TOOLS)).rejects.toThrow(/empty answer/);
  });
});
