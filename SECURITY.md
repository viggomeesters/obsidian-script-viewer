# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction requires script content, reduce it to a minimal synthetic example first.

## Security posture

Script Viewer is read-only. It reads supported script files through the vault API and renders local source, outline, and safety-hint views. It does not send vault content to external services, does not use runtime network APIs, does not read or write the system clipboard, does not execute scripts, does not start terminals or subprocesses, and does not write script files back to disk.

The v0.1 parser is a lightweight local heuristic parser. It is intended for inspection and navigation, not for executing code, linting, formatting, permission changes, refactoring, or IDE behavior.
