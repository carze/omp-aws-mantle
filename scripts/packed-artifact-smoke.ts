import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const packageRoot = path.resolve(import.meta.dir, "..");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-aws-mantle-pack-"));
const packDir = path.join(tempRoot, "pack");
const homeDir = path.join(tempRoot, "home");
const pluginsDir = path.join(homeDir, ".omp", "plugins");

async function run(command: string[], cwd: string, environment?: Record<string, string>): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode})\n${stderr}`);
  }
  return stdout;
}

try {
  await fs.mkdir(packDir, { recursive: true });
  await run(["bun", "pm", "pack", "--destination", packDir], packageRoot);
  const archives = (await fs.readdir(packDir)).filter(file => file.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`Expected one packed artifact, found ${archives.length}`);
  const archivePath = path.join(packDir, archives[0]);

  await fs.mkdir(pluginsDir, { recursive: true });
  await Bun.write(
    path.join(pluginsDir, "package.json"),
    JSON.stringify({ name: "omp-packed-smoke", private: true, dependencies: {} }),
  );
  await run(["bun", "install", "--omit", "peer", "--ignore-scripts", archivePath], pluginsDir);
  const installedScope = path.join(pluginsDir, "node_modules", "@oh-my-pi");
  await fs.mkdir(installedScope, { recursive: true });
  for (const dependency of ["pi-ai", "pi-catalog", "pi-coding-agent", "pi-utils"]) {
    await fs.symlink(
      path.join(packageRoot, "node_modules", "@oh-my-pi", dependency),
      path.join(installedScope, dependency),
      "dir",
    );
  }

  const installedRoot = path.join(pluginsDir, "node_modules", "omp-aws-mantle");
  const installedPackage = await Bun.file(path.join(installedRoot, "package.json")).json();
  if (installedPackage.omp?.extensions?.[0] !== "./dist/extension.js") {
    throw new Error("Packed manifest does not expose dist/extension.js");
  }
  const requiredFiles = ["dist/extension.js", "README.md", "CHANGELOG.md", "LICENSE"];
  for (const file of requiredFiles) {
    if (!(await Bun.file(path.join(installedRoot, file)).exists())) {
      throw new Error(`Packed artifact is missing ${file}`);
    }
  }
  for (const unpublishedPath of ["src", "test", "tsconfig.json"]) {
    if (await Bun.file(path.join(installedRoot, unpublishedPath)).exists()) {
      throw new Error(`Packed artifact unexpectedly contains ${unpublishedPath}`);
    }
  }

  await Bun.write(
    path.join(pluginsDir, "omp-plugins.lock.json"),
    JSON.stringify({
      plugins: {
        "omp-aws-mantle": {
          version: installedPackage.version,
          enabledFeatures: null,
          enabled: true,
        },
      },
      settings: {},
    }),
  );

  const smokeSource = String.raw`
import * as path from "node:path";
import { createAwsMantleExtension } from "omp-aws-mantle";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/manager";
import { getEnabledPlugins } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { discoverAndLoadExtensions } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader";
import { clearClaudePluginRootsCache } from "@oh-my-pi/pi-coding-agent/discovery/helpers";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = process.env.HOME;
if (!home) throw new Error("Packed smoke HOME is missing");
const project = path.join(home, "project");
await Bun.write(path.join(project, ".omp", ".keep"), "");
const manager = new PluginManager(project);

const installed = await manager.list();
assert(installed.some(plugin => plugin.name === "omp-aws-mantle" && plugin.enabled), "OMP did not list the packed plugin");
let enabled = await getEnabledPlugins(project, { home });
assert(enabled.some(plugin => plugin.name === "omp-aws-mantle"), "OMP did not discover the packed plugin");
const loaded = await discoverAndLoadExtensions([], project);
assert(loaded.errors.length === 0, "OMP failed to load the packed extension: " + loaded.errors.join("; "));
assert(loaded.extensions.some(extension => extension.path.endsWith("dist/extension.js")), "OMP did not load dist/extension.js");

let discoveryAuthorization;
let inferenceAuthorization;
let inferenceBody;
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/models") {
      discoveryAuthorization = request.headers.get("authorization");
      return Response.json({ data: [{ id: "openai.gpt-5.5" }, { id: "qwen.qwen3-coder-next" }] });
    }
    if (url.pathname === "/v1/chat/completions") {
      inferenceAuthorization = request.headers.get("authorization");
      inferenceBody = await request.json();
      const chunks = [
        {
          id: "packed-smoke",
          object: "chat.completion.chunk",
          created: 0,
          model: "qwen.qwen3-coder-next",
          choices: [{ index: 0, delta: { content: "Hello from packed Mantle" } }],
        },
        {
          id: "packed-smoke",
          object: "chat.completion.chunk",
          created: 0,
          model: "qwen.qwen3-coder-next",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
        },
      ];
      const body = chunks.map(chunk => "data: " + JSON.stringify(chunk)).join("\n\n") + "\n\ndata: [DONE]\n\n";
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response("not found", { status: 404 });
  },
});

try {
  const registrations = [];
  await createAwsMantleExtension({
    environment: { AWS_MANTLE_REGION: "us-east-1" },
    fetch: (input, init) => {
      const original = input instanceof Request && init === undefined ? input : new Request(input, init);
      return fetch(new URL("/v1/models", server.url), {
        method: original.method,
        headers: original.headers,
      });
    },
    warn: message => { throw new Error(message); },
  })({ registerProvider: (name, config) => registrations.push({ name, config }) });
  const provider = registrations.find(registration => registration.name === "aws-mantle");
  assert(provider, "Packed extension did not register aws-mantle");
  const models = await provider.config.fetchDynamicModels("packed-test-key");
  const selected = models.find(model => model.id === "qwen.qwen3-coder-next");
  assert(selected?.api === "openai-completions", "Packed extension did not route the chat model");
  const openAIProvider = registrations.find(registration => registration.name === "aws-mantle-openai");
  assert(openAIProvider, "Packed extension did not register aws-mantle-openai");
  assert(
    openAIProvider.config.baseUrl === "https://bedrock-mantle.us-east-1.api.aws/openai/v1",
    "Packed extension used the wrong dedicated OpenAI base URL",
  );
  const openAIModels = await openAIProvider.config.fetchDynamicModels("packed-test-key");
  assert(
    openAIModels.some(model => model.id === "openai.gpt-5.5" && model.api === "openai-responses"),
    "Packed extension did not route GPT-5.5 through dedicated OpenAI Responses",
  );
  const model = buildModel({
    id: selected.id,
    name: selected.name,
    api: selected.api,
    provider: "aws-mantle",
    baseUrl: new URL("/v1", server.url).toString().replace(/\/$/, ""),
    reasoning: selected.reasoning,
    input: selected.input,
    cost: selected.cost,
    contextWindow: selected.contextWindow,
    maxTokens: selected.maxTokens,
    ...(selected.thinking ? { thinking: selected.thinking } : {}),
    ...(selected.compat ? { compat: selected.compat } : {}),
  });
  const result = await streamOpenAICompletions(
    model,
    { messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }] },
    { apiKey: "packed-test-key" },
  ).result();
  assert(discoveryAuthorization === "Bearer packed-test-key", "Discovery bearer token was not sent");
  assert(inferenceAuthorization === "Bearer packed-test-key", "Inference bearer token was not sent");
  assert(inferenceBody?.model === "qwen.qwen3-coder-next" && inferenceBody?.stream === true, "Unexpected inference body");
  assert(result.content[0]?.type === "text" && result.content[0]?.text === "Hello from packed Mantle", "Packed stream text was not normalized");
  assert(result.usage.input === 5 && result.usage.output === 4 && result.stopReason === "stop", "Packed stream usage or stop reason was not normalized");
} finally {
  server.stop(true);
}

await manager.setEnabled("omp-aws-mantle", false);
clearClaudePluginRootsCache();
enabled = await getEnabledPlugins(project, { home });
assert(!enabled.some(plugin => plugin.name === "omp-aws-mantle"), "Disabled plugin remained discoverable");
await manager.setEnabled("omp-aws-mantle", true);
clearClaudePluginRootsCache();
enabled = await getEnabledPlugins(project, { home });
assert(enabled.some(plugin => plugin.name === "omp-aws-mantle"), "Re-enabled plugin was not discoverable");
await manager.uninstall("omp-aws-mantle");
assert(!(await manager.list()).some(plugin => plugin.name === "omp-aws-mantle"), "Uninstalled plugin remained listed");
`;
  const smokePath = path.join(pluginsDir, "packed-smoke.ts");
  await Bun.write(smokePath, smokeSource);
  const childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !["XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].includes(key),
    ),
  ) as Record<string, string>;
  childEnvironment.HOME = homeDir;
  childEnvironment.AWS_MANTLE_REGION = "us-east-1";
  childEnvironment.AWS_BEARER_TOKEN_BEDROCK = "packed-test-key";
  await run(["bun", smokePath], pluginsDir, childEnvironment);

  process.stdout.write("Packed artifact install, lifecycle, and streamed turn passed.\n");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
