# Local Coding Agent Harness (TypeScript)

A modular, human-in-the-loop coding agent for Windows, powered by a local Ollama model.

## Architecture

```text
src/
  index.ts                 CLI entry point
  agent.ts                 tool loop, message history, approval gate
  config.ts                config loading and validation
  types.ts                 shared TypeScript contracts
  ollama/
    client.ts              Ollama /api/chat client
    legacy-parser.ts       restricted fallback for legacy read-only tool syntax
  tools/
    registry.ts             tool registration and execution
    files.ts                list/read/search/write/edit files
    git.ts                  status/diff/branch/commit/push/PR
    shell.ts                approved PowerShell execution
    user.ts                 ask_user mid-task tool
  approval/terminal.ts      batch approval and clarifying questions
  security/paths.ts         workspace boundary and branch validation
  audit/logger.ts           JSONL audit events
tests/
  paths.test.ts
  files.test.ts
```

## Requirements

- Windows 10/11
- Node.js 20+
- Ollama installed and running
- A tool-capable model installed locally (for example `qwen3-coder:30b`; use the exact name shown by `ollama list`)
- Git installed; GitHub CLI (`gh`) is optional unless you use `create_pr`

## Setup (PowerShell)

```powershell
Copy-Item config.example.json config.json
notepad config.json

npm install
ollama list
# Edit config.json so ollama.model matches an installed model and workspace paths exist.
npm run typecheck
npm test
npm run dev
```

To build and run the compiled JavaScript:

```powershell
npm run build
npm start
```

## Configure workspaces

Edit `config.json` and replace the sample paths with existing absolute paths:

```json
{
  "ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen3-coder:30b",
    "timeoutMs": 120000
  },
  "workspaces": {
    "my-app": "C:/dev/my-app",
    "infra": "C:/dev/infra"
  },
  "defaultWorkspace": "my-app",
  "limits": {
    "maxFileBytes": 1000000,
    "maxSearchResults": 100,
    "shellTimeoutMs": 120000
  },
  "security": {
    "allowShell": true,
    "allowNetworkGit": true,
    "blockedBranchNames": ["main", "master"]
  }
}
```

Paths must be absolute and point to directories you trust. `config.json` is gitignored by convention; do not commit local paths or secrets.

## Approval behavior

- Read-only tools (`list_files`, `read_file`, `search_code`, `git_status`, `git_diff`, `ask_user`) do not require approval.
- Mutating tools (`write_file`, `edit_file`, `run_shell`, `run_shell_to_file`, `git_create_branch`, `git_commit`, `git_push`, `create_pr`) require typing the exact word `yes`.
- `run_shell_to_file` stores command output in a temporary file and returns an ID. `read_shell_output` returns the output once and deletes the file.
- `write_file` creates or replaces a complete UTF-8 file. `edit_file` replaces one exact text match in an existing UTF-8 file; it fails if the text is missing or appears more than once.
- If several mutating calls are proposed in one model response, the harness displays them together. Approval covers only that displayed batch, not future calls.
- Declining or typing anything except `yes` prevents those calls from executing.
- `ask_user` pauses the agent and waits for your answer.
- The agent is capped at 40 model turns per task.

## Security notes

This is a starter harness, **not a hardened sandbox**.

- PowerShell runs with your Windows user's permissions. An approved command can still delete files or access anything your account can access. Prefer a disposable VM/container and a low-privilege account for untrusted tasks.
- Approval is a human confirmation gate, not OS-level isolation. Review commands and paths before approving.
- Basic path checks block ordinary `..` traversal and absolute paths, but do not fully protect against malicious symlinks or junctions inside a workspace.
- Audit logs are written to `logs/audit.jsonl`; prompts, arguments and tool output snippets may contain secrets. Protect the log directory and do not submit credentials to the agent.
- `git_commit` stages all changes with `git add -A`; review `git status` and `.gitignore` first.
- Git push and PR creation are network operations, controlled by `allowNetworkGit`.
- Only `main` and `master` are protected by default; adjust `blockedBranchNames` for your repositories.
- Never let a model-generated shell command run without human review.

## Notes / limitations

- Structured Ollama `tool_calls` are preferred. The textual fallback supports allowlisted read-only calls and shell calls; shell calls still require explicit approval. Other mutating calls must use structured tool calls.
- Task history is in memory for the current process.
- Workspace selection is configured through `defaultWorkspace`; change it in `config.json` and restart.
- Node's built-in `fetch` is used; no Ollama SDK dependency is required.
