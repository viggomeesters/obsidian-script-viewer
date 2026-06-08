import {
  Notice,
  Plugin,
  TFile,
  TextFileView,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  OUTLINE_RENDER_LIMIT,
  ParsedScript,
  RiskHint,
  SCRIPT_EXTENSIONS,
  ScriptLine,
  ScriptToken,
  filterLines,
  filterOutline,
  findLineMatches,
  isSupportedScriptExtension,
  parseScript,
} from "./parser";

const VIEW_TYPE_SCRIPT_VIEWER = "script-viewer";

type ViewMode = "source" | "outline";

export default class ScriptViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_SCRIPT_VIEWER,
      (leaf) => new ScriptViewerView(leaf),
    );
    this.registerExtensions([...SCRIPT_EXTENSIONS], VIEW_TYPE_SCRIPT_VIEWER);

    this.addCommand({
      id: "open-current-script-in-viewer",
      name: "Open current script in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isScriptFile(file)) return false;

        if (!checking) {
          void this.openScriptFile(file);
        }
        return true;
      },
    });
  }

  async openScriptFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_SCRIPT_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class ScriptViewerView extends TextFileView {
  private mode: ViewMode = "source";
  private query = "";
  private filterSource = false;
  private wrapLines = true;
  private activeMatchIndex = 0;
  private jumpLine: number | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SCRIPT_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Script viewer";
  }

  getIcon(): string {
    return "scroll-text";
  }

  setViewData(data: string): void {
    this.data = data;
    this.render();
  }

  getViewData(): string {
    return this.data;
  }

  clear(): void {
    this.data = "";
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("script-viewer");

    const header = container.createDiv({ cls: "script-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No script file is attached to this viewer.");
      return;
    }

    if (!isScriptFile(this.file)) {
      renderMessage(container, "This viewer only supports .sh, .bash, .zsh, .bat, .cmd, .ps1, .ahk, .command, and .bats files.");
      return;
    }

    const parsed = parseScript(this.data, this.file.extension);
    const lineMatches = findLineMatches(parsed.lines, this.query);
    if (this.activeMatchIndex >= lineMatches.length) {
      this.activeMatchIndex = Math.max(0, lineMatches.length - 1);
    }

    renderSummary(container, parsed);
    renderWarnings(container, parsed);
    renderRiskPanel(container, parsed.risks);

    if (parsed.lineCount === 0) {
      renderMessage(container, "This script file is empty.");
      return;
    }

    if (this.mode === "outline") {
      renderOutline(container, parsed, this.query, (lineNumber) => {
        this.mode = "source";
        this.jumpLine = lineNumber;
        this.render();
      });
      return;
    }

    this.renderSource(container, parsed, lineMatches);
    this.scrollToJumpLine(container);
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "script-viewer__title" });
    title.createDiv({
      cls: "script-viewer__filename",
      text: this.file?.name ?? "Script file",
    });
    title.createDiv({
      cls: "script-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "script-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "script-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "script-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Search and filter scripts",
        placeholder: this.mode === "outline" ? "Filter outline" : "Search source",
        spellcheck: "false",
        type: "search",
        value: this.query,
      },
    });
    searchInput.addEventListener("input", () => {
      this.query = searchInput.value;
      this.activeMatchIndex = 0;
      this.jumpLine = null;
      this.render();
    });

    const modeGroup = toolbar.createDiv({
      cls: "script-viewer__segmented",
      attr: { "aria-label": "View mode" },
    });
    const sourceButton = createTextButton(modeGroup, "Source");
    const outlineButton = createTextButton(modeGroup, "Outline");
    sourceButton.toggleClass("is-active", this.mode === "source");
    outlineButton.toggleClass("is-active", this.mode === "outline");
    sourceButton.addEventListener("click", () => {
      this.mode = "source";
      this.render();
    });
    outlineButton.addEventListener("click", () => {
      this.mode = "outline";
      this.render();
    });

    const filterButton = createIconButton(toolbar, "list-filter", this.filterSource ? "Show all source lines" : "Filter source lines");
    filterButton.toggleClass("is-active", this.filterSource);
    filterButton.addEventListener("click", () => {
      this.filterSource = !this.filterSource;
      this.render();
    });

    const previousButton = createIconButton(toolbar, "chevron-up", "Previous source match");
    const nextButton = createIconButton(toolbar, "chevron-down", "Next source match");
    previousButton.addEventListener("click", () => this.moveMatch(-1));
    nextButton.addEventListener("click", () => this.moveMatch(1));

    const wrapButton = createIconButton(toolbar, "wrap-text", this.wrapLines ? "Disable soft wrap" : "Enable soft wrap");
    wrapButton.toggleClass("is-active", this.wrapLines);
    wrapButton.addEventListener("click", () => {
      this.wrapLines = !this.wrapLines;
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh file");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private moveMatch(direction: -1 | 1): void {
    const parsed = this.file ? parseScript(this.data, this.file.extension) : null;
    const matches = parsed ? findLineMatches(parsed.lines, this.query) : [];
    if (matches.length === 0) return;
    this.activeMatchIndex = (this.activeMatchIndex + direction + matches.length) % matches.length;
    this.jumpLine = matches[this.activeMatchIndex];
    this.mode = "source";
    this.render();
  }

  private renderSource(parent: HTMLElement, parsed: ParsedScript, lineMatches: number[]): void {
    const sourceLines = this.filterSource ? filterLines(parsed.renderedLines, this.query) : parsed.renderedLines;
    if (sourceLines.length === 0) {
      renderMessage(parent, "No source lines match the current filter.");
      return;
    }

    const activeLine = this.jumpLine ?? lineMatches[this.activeMatchIndex] ?? null;
    const body = parent.createDiv({
      cls: `script-viewer__source ${this.wrapLines ? "is-wrapped" : "is-nowrap"}`,
    });

    sourceLines.forEach((line) => {
      const isMatch = lineMatches.includes(line.lineNumber);
      const isActive = activeLine === line.lineNumber;
      const riskSeverity = strongestRisk(line.risks);
      const row = body.createDiv({
        cls: [
          "script-viewer__source-row",
          isMatch ? "has-search-match" : "",
          isActive ? "is-jump-target" : "",
          riskSeverity ? `has-risk--${riskSeverity}` : "",
        ].filter(Boolean).join(" "),
        attr: { "data-line": String(line.lineNumber) },
      });
      row.createSpan({ cls: "script-viewer__line-number", text: String(line.lineNumber) });
      const code = row.createSpan({ cls: "script-viewer__code" });
      renderLineTokens(code, line);
      if (line.risks.length > 0) {
        const risk = row.createSpan({
          cls: "script-viewer__risk-marker",
          attr: { "aria-label": line.risks.map((item) => item.label).join(", ") },
          text: "!",
        });
        risk.setAttribute("title", line.risks.map((item) => item.label).join(", "));
      }
    });
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No script file to refresh");
      return;
    }

    try {
      this.data = await this.app.vault.read(this.file);
      this.render();
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.addClass("script-viewer");
      renderMessage(this.contentEl, `Unable to read script file: ${getErrorMessage(error)}`);
    }
  }

  private scrollToJumpLine(container: HTMLElement): void {
    if (this.jumpLine === null) return;
    const lineNumber = this.jumpLine;
    window.requestAnimationFrame(() => {
      const target = container.querySelector(`[data-line="${lineNumber}"]`);
      target?.scrollIntoView({ block: "center" });
      this.jumpLine = null;
    });
  }
}

function renderSummary(parent: HTMLElement, parsed: ParsedScript): void {
  const summary = parent.createDiv({ cls: "script-viewer__summary" });
  summary.createSpan({ cls: "script-viewer__pill", text: parsed.language });
  summary.createSpan({ cls: "script-viewer__pill", text: `${parsed.lineCount} lines` });
  summary.createSpan({ cls: "script-viewer__pill", text: `${parsed.outline.length} outline items` });
  summary.createSpan({ cls: "script-viewer__pill", text: `${parsed.risks.length} risk hints` });
  summary.createSpan({ cls: "script-viewer__pill", text: `${parsed.envVarCount} variables` });
  summary.createSpan({ cls: "script-viewer__pill", text: `${parsed.commandCount} executable-looking lines` });
  summary.createSpan({ cls: "script-viewer__pill", text: `interpreter: ${parsed.interpreter}` });
  if (parsed.shebang) summary.createSpan({ cls: "script-viewer__pill", text: parsed.shebang });
  if (parsed.skippedLines > 0) {
    summary.createSpan({ cls: "script-viewer__note", text: `${parsed.renderedLines.length} lines rendered` });
  }
}

function renderWarnings(parent: HTMLElement, parsed: ParsedScript): void {
  if (parsed.warnings.length === 0) return;
  const box = parent.createDiv({ cls: "script-viewer__warnings" });
  box.createDiv({ cls: "script-viewer__section-title", text: "Parser notes" });
  parsed.warnings.slice(0, 8).forEach((warning) => {
    box.createDiv({ cls: "script-viewer__warning", text: `${warning.label}: ${warning.message}` });
  });
}

function renderRiskPanel(parent: HTMLElement, risks: RiskHint[]): void {
  if (risks.length === 0) return;
  const box = parent.createDiv({ cls: "script-viewer__risks" });
  box.createDiv({ cls: "script-viewer__section-title", text: "Safety hints" });
  risks.slice(0, 12).forEach((risk) => {
    box.createDiv({
      cls: `script-viewer__risk script-viewer__risk--${risk.severity}`,
      text: `L${risk.lineNumber} ${risk.label}: ${risk.detail}`,
    });
  });
  if (risks.length > 12) {
    box.createDiv({ cls: "script-viewer__risk-more", text: `${risks.length - 12} additional hints hidden` });
  }
}

function renderOutline(
  parent: HTMLElement,
  parsed: ParsedScript,
  query: string,
  onJump: (lineNumber: number) => void,
): void {
  const items = filterOutline(parsed.outline, query);
  if (items.length === 0) {
    renderMessage(parent, "No outline items match the current filter.");
    return;
  }
  const body = parent.createDiv({ cls: "script-viewer__outline" });
  items.forEach((item) => {
    const button = body.createEl("button", {
      cls: "script-viewer__outline-item",
      attr: { type: "button" },
    });
    button.createSpan({ cls: "script-viewer__outline-line", text: String(item.lineNumber) });
    button.createSpan({ cls: "script-viewer__outline-kind", text: item.kind });
    button.createSpan({ cls: "script-viewer__outline-name", text: item.name });
    button.createSpan({ cls: "script-viewer__outline-detail", text: item.detail });
    button.createSpan({ cls: "script-viewer__outline-source", text: item.source });
    button.addEventListener("click", () => onJump(item.lineNumber));
  });
  if (parsed.outline.length > OUTLINE_RENDER_LIMIT) {
    body.createDiv({
      cls: "script-viewer__outline-more",
      text: `${parsed.outline.length - OUTLINE_RENDER_LIMIT} additional outline items hidden`,
    });
  }
}

function renderLineTokens(parent: HTMLElement, line: ScriptLine): void {
  if (line.tokens.length === 0) {
    parent.createSpan({ text: line.raw || " " });
    return;
  }
  let cursor = 0;
  line.tokens.forEach((token) => {
    if (token.start > cursor) parent.createSpan({ text: line.raw.slice(cursor, token.start) });
    parent.createSpan({
      cls: `script-viewer__token script-viewer__token-${token.kind}`,
      attr: { title: token.label },
      text: line.raw.slice(token.start, token.end),
    });
    cursor = token.end;
  });
  if (cursor < line.raw.length) parent.createSpan({ text: line.raw.slice(cursor) });
  if (line.raw.length === 0) parent.createSpan({ text: " " });
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "script-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function createTextButton(parent: HTMLElement, label: string): HTMLButtonElement {
  return parent.createEl("button", {
    cls: "script-viewer__text-button",
    text: label,
    attr: { type: "button" },
  });
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "script-viewer__message", text: message });
}

function strongestRisk(risks: RiskHint[]): RiskHint["severity"] | null {
  if (risks.some((risk) => risk.severity === "danger")) return "danger";
  if (risks.some((risk) => risk.severity === "warning")) return "warning";
  if (risks.length > 0) return "notice";
  return null;
}

function isScriptFile(file: TFile | null): file is TFile {
  return !!file && isSupportedScriptExtension(file.extension);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
