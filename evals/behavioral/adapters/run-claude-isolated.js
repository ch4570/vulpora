#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {execFileSync, spawn} = require("node:child_process");

if (process.argv.length < 4) {
  process.stderr.write("usage: run-claude-isolated.js ISOLATED_HOME CLAUDE_ARG...\n");
  process.exit(2);
}

const [, , isolatedHome, ...args] = process.argv;
const apiKey = process.env.ANTHROPIC_API_KEY;
const hasApiKey = typeof apiKey === "string" && apiKey.length >= 16;
let accessToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!hasApiKey && !accessToken && process.platform === "darwin") {
  try {
    const item = JSON.parse(execFileSync("security", ["find-generic-password", "-w", "-s", "Claude Code-credentials"], {encoding: "utf8"}));
    accessToken = item.claudeAiOauth?.accessToken;
  } catch {}
}
if (!hasApiKey && (typeof accessToken !== "string" || accessToken.length < 16)) {
  process.stderr.write("claude_auth_unavailable\n");
  process.exit(78);
}

const configDir = path.join(isolatedHome, ".claude");
fs.mkdirSync(configDir, {recursive: true});
const installedSkills = process.env.CLAUDE_PLUGIN_ROOT && path.join(process.env.CLAUDE_PLUGIN_ROOT, "skills");
if (installedSkills && fs.statSync(installedSkills).isDirectory()) fs.symlinkSync(installedSkills, path.join(configDir, "skills"), "dir");
const env = {...process.env, HOME: isolatedHome, CLAUDE_CONFIG_DIR: configDir};
if (hasApiKey) delete env.CLAUDE_CODE_OAUTH_TOKEN;
else env.CLAUDE_CODE_OAUTH_TOKEN = accessToken;
const child = spawn("claude", args, {env, stdio: "inherit"});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { process.stderr.write(`claude_spawn_failed:${error.message}\n`); process.exit(1); });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 128 : 1)));
