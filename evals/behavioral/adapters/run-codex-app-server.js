#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const {spawn} = require("node:child_process");
const {buildTurnStartParams, loadReportSchema} = require("./codex-turn-contract.js");

if (process.argv.length !== 8) {
  process.stderr.write("usage: run-codex-app-server.js FIXTURE PROMPT_FILE EVENTS REPORT AUTH_FILE REPORT_SCHEMA\n");
  process.exit(2);
}
const [, , fixture, promptFile, eventsPath, reportPath, authPath, schemaPath] = process.argv;
const prompt = fs.readFileSync(promptFile, "utf8");
let outputSchema;
try { outputSchema = loadReportSchema(schemaPath); } catch (error) {
  process.stderr.write(`schema_read_failed:${error.message}\n`);
  process.exit(2);
}
let hostAuth;
try {
  const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
  hostAuth = {accessToken: auth.tokens?.access_token, chatgptAccountId: auth.tokens?.account_id};
  if (typeof hostAuth.accessToken !== "string" || typeof hostAuth.chatgptAccountId !== "string") throw new Error("unsupported_auth_shape");
} catch (error) {
  process.stderr.write(`auth_read_failed:${error.message}\n`);
  process.exit(2);
}
const events = fs.createWriteStream(eventsPath, {flags: "wx"});
const child = spawn("codex", ["app-server", "--stdio", "--enable", "multi_agent", "--enable", "multi_agent_v2"], {
  cwd: fixture,
  env: {...process.env, VULPORA_PARENT_NETWORK_DENIED: "1"},
  stdio: ["pipe", "pipe", "pipe"],
});
let buffer = "", stderr = "", topThreadId = null, completed = false, lastTopMessage = null;

function send(message) {
  let recorded = message;
  if (message.method === "turn/start") recorded = {...message, params: {...message.params, input: [{type: "text", text: "[runtime-native $start-task prompt redacted after activation]"}]}};
  if (message.method === "account/login/start") recorded = {...message, params: {...message.params, accessToken: "[REDACTED]", chatgptAccountId: "[REDACTED]"}};
  if (!message.method && message.result?.accessToken) recorded = {...message, result: {...message.result, accessToken: "[REDACTED]", chatgptAccountId: "[REDACTED]"}};
  events.write(`${JSON.stringify({direction: "client_to_runtime", ...recorded})}\n`);
  child.stdin.write(`${JSON.stringify(message)}\n`);
}
function startThread() {
  send({id: 2, method: "thread/start", params: {cwd: fixture, approvalPolicy: "never", sandbox: "workspace-write", ephemeral: true, experimentalRawEvents: true}});
}
function stop(code, message) {
  if (completed) return;
  completed = true;
  if (message) process.stderr.write(`${message}\n`);
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  events.end(() => process.exit(code));
}
function parseReport(text) {
  if (typeof text !== "string") return null;
  try { return JSON.parse(text); } catch {}
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
}
function handle(message) {
  events.write(`${JSON.stringify(message)}\n`);
  if (message.id === 1) {
    if (message.error) return stop(1, `initialize_failed:${message.error.message || "unknown"}`);
    send({method: "initialized", params: {}});
    send({id: 90, method: "account/login/start", params: {type: "chatgptAuthTokens", ...hostAuth}});
    return;
  }
  if (message.id === 90) {
    if (message.error || message.result?.type !== "chatgptAuthTokens") return stop(1, `external_auth_failed:${message.error?.message || "unexpected_response"}`);
    startThread();
    return;
  }
  if (message.id === 2) {
    if (message.error) return stop(1, `thread_start_failed:${message.error.message || "unknown"}`);
    topThreadId = message.result?.thread?.id;
    if (!topThreadId) return stop(1, "thread_start_missing_id");
    send({id: 3, method: "turn/start", params: buildTurnStartParams({
      threadId: topThreadId,
      prompt,
      fixture,
      outputSchema,
    })});
    return;
  }
  if (message.id === 3 && message.error) return stop(1, `turn_start_failed:${message.error.message || "unknown"}`);
  const method = message.method || "";
  const params = message.params || {};
  if (method === "account/chatgptAuthTokens/refresh" && message.id !== undefined) {
    send({id: message.id, result: hostAuth});
    return;
  }
  const item = params.item;
  if (method === "item/completed" && params.threadId === topThreadId && item?.type === "agentMessage") lastTopMessage = item.text;
  if (method === "turn/completed" && params.threadId === topThreadId) {
    const report = parseReport(lastTopMessage);
    if (!report) return stop(65, "terminal_report_parse_failed");
    fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`, {flag: "wx"});
    completed = true;
    child.stdin.end();
    child.kill("SIGTERM");
    events.end(() => process.exit(0));
  }
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    try { handle(JSON.parse(line)); } catch (error) { stop(1, `protocol_parse_failed:${error.message}`); }
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
child.on("error", (error) => stop(1, `app_server_spawn_failed:${error.message}`));
child.on("exit", (code) => {
  if (!completed) stop(code || 1, `app_server_exited:${code}:${stderr.trim().slice(-1000)}`);
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(130, `interrupted:${signal}`));

send({id: 1, method: "initialize", params: {clientInfo: {name: "vulpora-start-task-e2e", version: "1.0.0"}, capabilities: {experimentalApi: true}}});
