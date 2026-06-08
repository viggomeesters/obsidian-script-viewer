import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const parser = fs.readFileSync("src/parser.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

const forbiddenRuntimePatterns = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "navigator.clipboard",
  "child_process",
  "spawn(",
  "exec(",
  "eval(",
  "new Function",
  "process.",
];

const assertions = [
  [manifest.id === "script-viewer", "manifest id is script-viewer"],
  [manifest.name === "Script Viewer", "manifest name is Script Viewer"],
  [manifest.version === "0.1.2", "manifest version is 0.1.2"],
  [!/obsidian/i.test(manifest.description), "manifest description avoids product name"],
  [main.includes("registerExtensions([...SCRIPT_EXTENSIONS]"), "script extensions are registered"],
  [main.includes("patchDotfileOpenRouting"), "dotfile open routing patch exists"],
  [main.includes("WorkspaceLeaf.prototype.openFile"), "WorkspaceLeaf openFile routing is patched"],
  [main.includes('workspace.on("file-open"'), "file-open fallback routing exists"],
  [main.includes("rerouteOpenScriptFile"), "file-open reroute handler exists"],
  [parser.includes("\"sh\"") && parser.includes("\"bat\"") && parser.includes("\"ps1\"") && parser.includes("\"ahk\""), "script extension set exists"],
  [parser.includes("SCRIPT_DOTFILE_NAMES") && parser.includes(".gitignore") && parser.includes(".env"), "script dotfile set exists"],
  [parser.includes("isSupportedScriptPath"), "path-based support matcher exists"],
  [main.includes("extends TextFileView"), "TextFileView is used"],
  [main.includes("type ViewMode = \"source\" | \"outline\""), "source/outline mode exists"],
  [main.includes("filterLines(parsed.renderedLines, this.query)"), "source filter exists"],
  [main.includes("filterOutline(parsed.outline, query)"), "outline filter exists"],
  [main.includes("this.app.vault.read(this.file)"), "refresh reads through vault API"],
  [parser.includes("RENDER_LINE_LIMIT = 10000"), "render cap exists"],
  [parser.includes("detectShebang"), "shebang detection exists"],
  [parser.includes("riskHintsForLine"), "risk hints exist"],
  [forbiddenRuntimePatterns.every((pattern) => !main.includes(pattern) && !parser.includes(pattern)), "no forbidden runtime APIs"],
  [!styles.includes("!important"), "styles do not use important overrides"],
  [["main.js", "manifest.json", "styles.css"].every((file) => fs.existsSync(file)), "runtime assets exist"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("Script Viewer smoke checks passed.");
