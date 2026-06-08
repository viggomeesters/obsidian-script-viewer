import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const {
  RENDER_LINE_LIMIT,
  SCRIPT_EXTENSIONS,
  filterLines,
  filterOutline,
  findLineMatches,
  languageForExtension,
  parseScript,
} = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));

function readFixture(name) {
  return fs.readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8");
}

assert.deepEqual(SCRIPT_EXTENSIONS, ["sh", "bash", "zsh", "bat", "cmd", "ps1", "ahk", "command", "bats"]);
assert.equal(languageForExtension("sh"), "shell");
assert.equal(languageForExtension("bat"), "batch");
assert.equal(languageForExtension("ps1"), "powershell");
assert.equal(languageForExtension("ahk"), "autohotkey");

const shell = parseScript(readFixture("deploy.sh"), "sh");
assert.equal(shell.language, "shell");
assert.equal(shell.shebang, "#!/usr/bin/env bash");
assert.ok(shell.interpreter.includes("bash"));
assert.ok(shell.outline.some((item) => item.kind === "function" && item.name === "cleanup"));
assert.ok(shell.outline.some((item) => item.kind === "trap"));
assert.ok(shell.outline.some((item) => item.kind === "export" && item.name === "LOG_DIR"));
assert.ok(shell.risks.some((risk) => risk.label === "destructive remove flags"));
assert.ok(shell.envVarCount > 0);

const batch = parseScript(readFixture("deploy.bat"), "bat");
assert.equal(batch.language, "batch");
assert.ok(batch.outline.some((item) => item.kind === "label" && item.name === "deploy"));
assert.ok(batch.outline.some((item) => item.kind === "set" && item.name === "TARGET"));
assert.ok(batch.risks.some((risk) => risk.label === "risky batch command"));

const powershell = parseScript(readFixture("profile.ps1"), "ps1");
assert.equal(powershell.language, "powershell");
assert.ok(powershell.outline.some((item) => item.kind === "function" && item.name === "Sync-Workspace"));
assert.ok(powershell.outline.some((item) => item.kind === "export" && item.name === "SCRIPT_HOME"));
assert.ok(powershell.risks.some((risk) => risk.label === "risky PowerShell command"));

const ahk = parseScript(readFixture("hotkeys.ahk"), "ahk");
assert.equal(ahk.language, "autohotkey");
assert.ok(ahk.outline.some((item) => item.kind === "hotkey" && item.name.includes("^!t")));
assert.ok(ahk.outline.some((item) => item.kind === "label" && item.name === "OpenTools"));
assert.ok(ahk.risks.some((risk) => risk.label === "risky AutoHotkey command"));

const command = parseScript(readFixture("mac.command"), "command");
assert.equal(command.language, "shell");
assert.ok(command.shebang?.includes("zsh"));

const bats = parseScript(readFixture("checks.bats"), "bats");
assert.equal(bats.language, "shell");
assert.ok(bats.outline.some((item) => item.kind === "function" || item.kind === "command"));

const harmless = parseScript(readFixture("harmless-looking.sh"), "sh");
assert.equal(harmless.risks.length, 0);
assert.ok(harmless.lines.some((line) => line.tokens.some((token) => token.kind === "string")));

const empty = parseScript(readFixture("empty.sh"), "sh");
assert.equal(empty.lineCount, 0);
assert.equal(empty.risks.length, 0);

const sourceMatches = filterLines(shell.lines, "cleanup");
assert.ok(sourceMatches.length >= 2);
assert.ok(findLineMatches(shell.lines, "cleanup").length >= 2);
assert.ok(filterOutline(shell.outline, "cleanup").some((item) => item.name === "cleanup"));

const largeText = Array.from({ length: RENDER_LINE_LIMIT + 7 }, (_, index) => `echo line_${index}`).join("\n");
const large = parseScript(largeText, "sh");
assert.equal(large.renderedLines.length, RENDER_LINE_LIMIT);
assert.equal(large.skippedLines, 7);
assert.ok(large.warnings.some((warning) => warning.label === "Render cap"));

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("Script Viewer parser fixture tests passed.");
