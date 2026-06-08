export const RENDER_LINE_LIMIT = 10000;
export const OUTLINE_RENDER_LIMIT = 1000;

export const SCRIPT_EXTENSIONS = [
  "sh",
  "bash",
  "zsh",
  "bat",
  "cmd",
  "ps1",
  "ahk",
  "command",
  "bats",
] as const;

export type ScriptExtension = (typeof SCRIPT_EXTENSIONS)[number];
export type ScriptLanguage = "shell" | "batch" | "powershell" | "autohotkey" | "unknown";
export type TokenKind = "comment" | "string" | "variable" | "substitution" | "path" | "url" | "flag" | "risk" | "keyword";
export type OutlineKind = "function" | "label" | "trap" | "alias" | "export" | "set" | "hotkey" | "command";
export type RiskSeverity = "notice" | "warning" | "danger";

export interface TextRange {
  start: number;
  end: number;
}

export interface ScriptToken extends TextRange {
  kind: TokenKind;
  label: string;
}

export interface RiskHint {
  label: string;
  severity: RiskSeverity;
  lineNumber: number;
  detail: string;
}

export interface OutlineItem {
  kind: OutlineKind;
  name: string;
  detail: string;
  lineNumber: number;
  source: string;
  searchText: string;
}

export interface ScriptLine {
  lineNumber: number;
  raw: string;
  tokens: ScriptToken[];
  risks: RiskHint[];
}

export interface ScriptWarning {
  label: string;
  message: string;
}

export interface ParsedScript {
  extension: string;
  language: ScriptLanguage;
  interpreter: string;
  shebang: string | null;
  lines: ScriptLine[];
  renderedLines: ScriptLine[];
  skippedLines: number;
  lineCount: number;
  byteCount: number;
  outline: OutlineItem[];
  risks: RiskHint[];
  envVarCount: number;
  commandCount: number;
  warnings: ScriptWarning[];
}

const SHELL_EXTENSIONS = new Set(["sh", "bash", "zsh", "command", "bats"]);
const BATCH_EXTENSIONS = new Set(["bat", "cmd"]);
const POWERSHELL_EXTENSIONS = new Set(["ps1"]);
const AUTOHOTKEY_EXTENSIONS = new Set(["ahk"]);

const SHELL_KEYWORDS = new Set([
  "alias",
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "export",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "local",
  "set",
  "then",
  "trap",
  "while",
]);

const POWERSHELL_KEYWORDS = new Set([
  "begin",
  "catch",
  "class",
  "do",
  "else",
  "elseif",
  "end",
  "finally",
  "for",
  "foreach",
  "function",
  "if",
  "param",
  "process",
  "return",
  "switch",
  "trap",
  "try",
  "until",
  "while",
]);

const BATCH_KEYWORDS = new Set(["call", "echo", "for", "goto", "if", "rem", "set", "setlocal"]);
const AHK_KEYWORDS = new Set(["else", "gosub", "goto", "if", "loop", "return", "run", "runwait", "settimer"]);

const RISK_PATTERNS: Record<ScriptLanguage, Array<{ pattern: RegExp; label: string; severity: RiskSeverity }>> = {
  shell: [
    { pattern: /\b(?:rm|sudo|chmod|chown|dd|mkfs|curl|wget|ssh|scp|rsync|nc|ncat|killall|launchctl)\b/i, label: "risky shell command", severity: "warning" },
    { pattern: /\brm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b/i, label: "destructive remove flags", severity: "danger" },
    { pattern: />\s*\/(?:etc|var|usr|bin|sbin)\b/i, label: "system path redirection", severity: "danger" },
  ],
  batch: [
    { pattern: /\b(?:del|erase|rd|rmdir|format|reg|sc|shutdown|taskkill|bitsadmin|powershell|pwsh)\b/i, label: "risky batch command", severity: "warning" },
    { pattern: /\b(?:del|erase|rd|rmdir)\b.*\/[sq]\b/i, label: "destructive delete flags", severity: "danger" },
  ],
  powershell: [
    { pattern: /\b(?:Invoke-Expression|IEX|Start-Process|Remove-Item|Set-ExecutionPolicy|New-Object|Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer)\b/i, label: "risky PowerShell command", severity: "warning" },
    { pattern: /\bRemove-Item\b.*-(?:Recurse|Force)\b/i, label: "destructive remove flags", severity: "danger" },
  ],
  autohotkey: [
    { pattern: /\b(?:Run|RunWait|FileDelete|FileRemoveDir|RegWrite|RegDelete|UrlDownloadToFile|Shutdown)\b/i, label: "risky AutoHotkey command", severity: "warning" },
  ],
  unknown: [],
};

export function isSupportedScriptExtension(extension: string): extension is ScriptExtension {
  return SCRIPT_EXTENSIONS.includes(extension.toLowerCase() as ScriptExtension);
}

export function languageForExtension(extension: string): ScriptLanguage {
  const normalized = extension.toLowerCase();
  if (SHELL_EXTENSIONS.has(normalized)) return "shell";
  if (BATCH_EXTENSIONS.has(normalized)) return "batch";
  if (POWERSHELL_EXTENSIONS.has(normalized)) return "powershell";
  if (AUTOHOTKEY_EXTENSIONS.has(normalized)) return "autohotkey";
  return "unknown";
}

export function parseScript(data: string, extension: string): ParsedScript {
  const language = languageForExtension(extension);
  const rawLines = splitLines(data);
  const shebang = detectShebang(rawLines);
  const interpreter = detectInterpreter(language, shebang, extension);
  const warnings: ScriptWarning[] = [];
  const outline: OutlineItem[] = [];
  const risks: RiskHint[] = [];
  const lines: ScriptLine[] = [];
  let envVarCount = 0;
  let commandCount = 0;

  rawLines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const codeRange = codeRangeForLine(raw, language);
    const lineRisks = riskHintsForLine(raw, codeRange, language, lineNumber);
    const tokens = sortedTokens([
      ...commentTokens(raw, codeRange),
      ...stringTokens(raw, codeRange),
      ...genericTokens(raw, codeRange, language),
      ...keywordTokens(raw, codeRange, language),
      ...riskTokens(raw, codeRange, language),
    ]);
    const lineOutline = outlineItemForLine(raw, codeRange, language, lineNumber);
    envVarCount += countVariables(raw, codeRange, language);
    if (looksLikeCommand(raw, codeRange, language)) commandCount += 1;
    if (lineOutline) outline.push(lineOutline);
    risks.push(...lineRisks);
    lines.push({ lineNumber, raw, tokens, risks: lineRisks });
  });

  const renderedLines = lines.slice(0, RENDER_LINE_LIMIT);
  const skippedLines = Math.max(0, lines.length - renderedLines.length);
  if (skippedLines > 0) {
    warnings.push({
      label: "Render cap",
      message: `${skippedLines} lines are not rendered to keep the view responsive.`,
    });
  }
  if (outline.length > OUTLINE_RENDER_LIMIT) {
    warnings.push({
      label: "Outline cap",
      message: `${outline.length - OUTLINE_RENDER_LIMIT} outline items are hidden in the outline view.`,
    });
  }
  if (language === "unknown") {
    warnings.push({
      label: "Unknown script type",
      message: "The file is rendered as text because its script language is not recognized.",
    });
  }

  return {
    extension,
    language,
    interpreter,
    shebang,
    lines,
    renderedLines,
    skippedLines,
    lineCount: data.length === 0 ? 0 : lines.length,
    byteCount: new TextEncoder().encode(data).length,
    outline,
    risks,
    envVarCount,
    commandCount,
    warnings,
  };
}

export function filterLines(lines: ScriptLine[], query: string): ScriptLine[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return lines;
  return lines.filter((line) => line.raw.toLowerCase().includes(needle));
}

export function filterOutline(outline: OutlineItem[], query: string): OutlineItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return outline.slice(0, OUTLINE_RENDER_LIMIT);
  return outline.filter((item) => item.searchText.includes(needle)).slice(0, OUTLINE_RENDER_LIMIT);
}

export function findLineMatches(lines: ScriptLine[], query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return lines.filter((line) => line.raw.toLowerCase().includes(needle)).map((line) => line.lineNumber);
}

function splitLines(data: string): string[] {
  if (data.length === 0) return [];
  const lines = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "" && data.endsWith("\n")) lines.pop();
  return lines;
}

function detectShebang(lines: string[]): string | null {
  const first = lines[0]?.trim();
  return first?.startsWith("#!") ? first : null;
}

function detectInterpreter(language: ScriptLanguage, shebang: string | null, extension: string): string {
  if (shebang) return shebang.replace(/^#!\s*/, "");
  if (language === "shell") return extension === "zsh" ? "zsh" : extension === "bash" || extension === "bats" ? "bash" : "shell";
  if (language === "batch") return "cmd.exe";
  if (language === "powershell") return "PowerShell";
  if (language === "autohotkey") return "AutoHotkey";
  return "unknown";
}

function codeRangeForLine(raw: string, language: ScriptLanguage): TextRange {
  const commentStart = findCommentStart(raw, language);
  return { start: 0, end: commentStart ?? raw.length };
}

function findCommentStart(raw: string, language: ScriptLanguage): number | null {
  if (language === "batch") {
    if (/^\s*(?:rem\b|::)/i.test(raw)) return raw.search(/\S/);
    return null;
  }
  if (language === "autohotkey") return findUnquoted(raw, ";");
  return findUnquoted(raw, "#");
}

function commentTokens(raw: string, codeRange: TextRange): ScriptToken[] {
  if (codeRange.end >= raw.length) return [];
  return [{ start: codeRange.end, end: raw.length, kind: "comment", label: "comment" }];
}

function stringTokens(raw: string, codeRange: TextRange): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  let quote: "'" | "\"" | "`" | null = null;
  let start = -1;
  let escaped = false;
  for (let index = codeRange.start; index < codeRange.end; index += 1) {
    const char = raw[index];
    if (!quote && (char === "'" || char === "\"" || char === "`")) {
      quote = char;
      start = index;
      escaped = false;
      continue;
    }
    if (quote && !escaped && char === quote) {
      tokens.push({
        start,
        end: index + 1,
        kind: quote === "`" ? "substitution" : "string",
        label: quote === "`" ? "command substitution" : "string",
      });
      quote = null;
      start = -1;
      continue;
    }
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  if (quote && start >= 0) {
    tokens.push({ start, end: codeRange.end, kind: quote === "`" ? "substitution" : "string", label: "unterminated string" });
  }
  return tokens;
}

function genericTokens(raw: string, codeRange: TextRange, language: ScriptLanguage): ScriptToken[] {
  const source = raw.slice(codeRange.start, codeRange.end);
  const tokens: ScriptToken[] = [];
  addMatches(tokens, source, /\bhttps?:\/\/[^\s"'<>]+/gi, codeRange.start, "url", "URL");
  addMatches(tokens, source, /(?:^|[\s:=])((?:~|\.{1,2}|\/)[A-Za-z0-9_./%+-]+)/g, codeRange.start, "path", "path", 1);
  addMatches(tokens, source, /(?:^|\s)(--?[A-Za-z][\w-]*|\/[A-Za-z?]+)/g, codeRange.start, "flag", "flag", 1);
  if (language === "batch") {
    addMatches(tokens, source, /%[A-Za-z_][A-Za-z0-9_]*%|![A-Za-z_][A-Za-z0-9_]*!/g, codeRange.start, "variable", "environment variable");
  } else if (language === "autohotkey") {
    addMatches(tokens, source, /%[A-Za-z_][A-Za-z0-9_]*%/g, codeRange.start, "variable", "variable");
  } else {
    addMatches(tokens, source, /\$\{?[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?\}?/g, codeRange.start, "variable", "variable");
    addMatches(tokens, source, /\$\([^)]+\)/g, codeRange.start, "substitution", "command substitution");
  }
  return tokens;
}

function keywordTokens(raw: string, codeRange: TextRange, language: ScriptLanguage): ScriptToken[] {
  const keywords = keywordsFor(language);
  if (keywords.size === 0) return [];
  const source = raw.slice(codeRange.start, codeRange.end);
  const tokens: ScriptToken[] = [];
  const keywordPattern = /\b[A-Za-z_][A-Za-z0-9_-]*\b/g;
  for (const match of source.matchAll(keywordPattern)) {
    if (!keywords.has(match[0].toLowerCase())) continue;
    tokens.push({
      start: codeRange.start + match.index,
      end: codeRange.start + match.index + match[0].length,
      kind: "keyword",
      label: "keyword",
    });
  }
  return tokens;
}

function keywordsFor(language: ScriptLanguage): Set<string> {
  if (language === "shell") return SHELL_KEYWORDS;
  if (language === "batch") return BATCH_KEYWORDS;
  if (language === "powershell") return POWERSHELL_KEYWORDS;
  if (language === "autohotkey") return AHK_KEYWORDS;
  return new Set();
}

function riskHintsForLine(raw: string, codeRange: TextRange, language: ScriptLanguage, lineNumber: number): RiskHint[] {
  const code = raw.slice(codeRange.start, codeRange.end);
  const strings = stringTokens(raw, codeRange).filter((token) => token.kind === "string");
  return RISK_PATTERNS[language]
    .filter((entry) => {
      const pattern = globalPattern(entry.pattern);
      for (const match of code.matchAll(pattern)) {
        const range = { start: codeRange.start + match.index, end: codeRange.start + match.index + match[0].length };
        if (!strings.some((token) => rangesOverlap(token, range))) return true;
      }
      return false;
    })
    .map((entry) => ({
      label: entry.label,
      severity: entry.severity,
      lineNumber,
      detail: code.trim(),
    }));
}

function riskTokens(raw: string, codeRange: TextRange, language: ScriptLanguage): ScriptToken[] {
  const code = raw.slice(codeRange.start, codeRange.end);
  const tokens: ScriptToken[] = [];
  const strings = stringTokens(raw, codeRange).filter((token) => token.kind === "string");
  for (const entry of RISK_PATTERNS[language]) {
    const pattern = globalPattern(entry.pattern);
    for (const match of code.matchAll(pattern)) {
      const matched = match[0];
      if (!matched) continue;
      const range = { start: codeRange.start + match.index, end: codeRange.start + match.index + matched.length };
      if (strings.some((token) => rangesOverlap(token, range))) {
        continue;
      }
      tokens.push({
        start: range.start,
        end: range.end,
        kind: "risk",
        label: entry.label,
      });
    }
  }
  return tokens;
}

function countVariables(raw: string, codeRange: TextRange, language: ScriptLanguage): number {
  const code = raw.slice(codeRange.start, codeRange.end);
  if (language === "batch") return countMatches(code, /%[A-Za-z_][A-Za-z0-9_]*%|![A-Za-z_][A-Za-z0-9_]*!/g);
  if (language === "autohotkey") return countMatches(code, /%[A-Za-z_][A-Za-z0-9_]*%/g);
  return countMatches(code, /\$\{?[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?\}?/g);
}

function outlineItemForLine(raw: string, codeRange: TextRange, language: ScriptLanguage, lineNumber: number): OutlineItem | null {
  const code = raw.slice(codeRange.start, codeRange.end).trim();
  if (!code) return null;
  const candidates = outlinePatterns(language);
  for (const candidate of candidates) {
    const match = code.match(candidate.pattern);
    if (!match) continue;
    const name = (match[candidate.nameGroup] ?? match[0]).trim();
    return createOutline(candidate.kind, name, candidate.detail(name, code), lineNumber, raw.trim());
  }
  const command = firstCommand(code, language);
  if (!command) return null;
  if (riskyCommandName(command, language)) return createOutline("command", command, "executable-looking command", lineNumber, raw.trim());
  return null;
}

function outlinePatterns(language: ScriptLanguage): Array<{ pattern: RegExp; kind: OutlineKind; nameGroup: number; detail: (name: string, code: string) => string }> {
  if (language === "shell") {
    return [
      { pattern: /^function\s+([A-Za-z_][\w-]*)\b/, kind: "function", nameGroup: 1, detail: (name) => `function ${name}` },
      { pattern: /^([A-Za-z_][\w-]*)\s*\(\)\s*\{?/, kind: "function", nameGroup: 1, detail: (name) => `${name}()` },
      { pattern: /^trap\s+(.+)/, kind: "trap", nameGroup: 1, detail: (_name, code) => code },
      { pattern: /^alias\s+([A-Za-z_][\w-]*)=/, kind: "alias", nameGroup: 1, detail: (name) => `alias ${name}` },
      { pattern: /^export\s+([A-Za-z_][\w-]*)\b/, kind: "export", nameGroup: 1, detail: (name) => `export ${name}` },
      { pattern: /^set\s+(.+)/, kind: "set", nameGroup: 1, detail: (_name, code) => code },
    ];
  }
  if (language === "batch") {
    return [
      { pattern: /^:([A-Za-z0-9_.-]+)/, kind: "label", nameGroup: 1, detail: (name) => `:${name}` },
      { pattern: /^set\s+([A-Za-z_][A-Za-z0-9_]*)=/i, kind: "set", nameGroup: 1, detail: (name) => `set ${name}` },
    ];
  }
  if (language === "powershell") {
    return [
      { pattern: /^function\s+([A-Za-z_][\w-]*)\b/i, kind: "function", nameGroup: 1, detail: (name) => `function ${name}` },
      { pattern: /^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=/i, kind: "export", nameGroup: 1, detail: (name) => `$env:${name}` },
      { pattern: /^Set-(?:StrictMode|Variable)\b(.+)?/i, kind: "set", nameGroup: 0, detail: (_name, code) => code },
      { pattern: /^trap\b(.+)?/i, kind: "trap", nameGroup: 0, detail: (_name, code) => code },
    ];
  }
  if (language === "autohotkey") {
    return [
      { pattern: /^([#!^+*~$<>A-Za-z0-9 &]+)::/, kind: "hotkey", nameGroup: 1, detail: (name) => `${name}::` },
      { pattern: /^([A-Za-z_][\w-]*):$/, kind: "label", nameGroup: 1, detail: (name) => `${name}:` },
      { pattern: /^Set(?:TitleMatchMode|WorkingDir|Timer)\b(.+)?/i, kind: "set", nameGroup: 0, detail: (_name, code) => code },
    ];
  }
  return [];
}

function createOutline(kind: OutlineKind, name: string, detail: string, lineNumber: number, source: string): OutlineItem {
  return {
    kind,
    name,
    detail,
    lineNumber,
    source,
    searchText: [kind, name, detail, source].join(" ").toLowerCase(),
  };
}

function looksLikeCommand(raw: string, codeRange: TextRange, language: ScriptLanguage): boolean {
  const command = firstCommand(raw.slice(codeRange.start, codeRange.end).trim(), language);
  return command !== null;
}

function firstCommand(code: string, language: ScriptLanguage): string | null {
  if (!code) return null;
  if (language === "batch" && code.startsWith(":")) return null;
  const normalized = code.replace(/^(?:if|while|for|sudo|command|builtin|call)\s+/i, "");
  const match = normalized.match(/^([A-Za-z_./~:-][A-Za-z0-9_./~:-]*)/);
  if (!match) return null;
  const command = match[1].replace(/\.(?:exe|cmd|bat)$/i, "");
  if (keywordsFor(language).has(command.toLowerCase())) return null;
  return command;
}

function riskyCommandName(command: string, language: ScriptLanguage): boolean {
  return RISK_PATTERNS[language].some((entry) => entry.pattern.test(command));
}

function addMatches(
  tokens: ScriptToken[],
  source: string,
  pattern: RegExp,
  offset: number,
  kind: TokenKind,
  label: string,
  group = 0,
): void {
  for (const match of source.matchAll(pattern)) {
    const matched = match[group];
    if (!matched) continue;
    const groupOffset = match[0].indexOf(matched);
    const start = offset + match.index + groupOffset;
    tokens.push({ start, end: start + matched.length, kind, label });
  }
}

function globalPattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function sortedTokens(tokens: ScriptToken[]): ScriptToken[] {
  const sorted = tokens
    .filter((token) => token.end > token.start)
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const accepted: ScriptToken[] = [];
  for (const token of sorted) {
    if (accepted.some((existing) => rangesOverlap(existing, token))) continue;
    accepted.push(token);
  }
  return accepted;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function countMatches(data: string, pattern: RegExp): number {
  return data.match(pattern)?.length ?? 0;
}

function findUnquoted(raw: string, target: string): number | null {
  let single = false;
  let double = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!escaped && char === "'" && !double) single = !single;
    if (!escaped && char === "\"" && !single) double = !double;
    if (!single && !double && char === target) return index;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  return null;
}
