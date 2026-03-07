# Snowflake Sonnet 4.6

This guide uses Snowflake-hosted `claude-sonnet-4-6` for repo chat and one-off prompts.

## Quick Start

From the project root:

```powershell
cd "N:\Coding (backup)"
npm run ai:snowflake:chat:sonnet -- --file README.md
```

That opens an interactive chat about the repo using `claude-sonnet-4-6`.

For automatic repo searching on each message:

```powershell
npm run ai:snowflake:chat:auto:sonnet
```

## One-Off Prompts

Review the current diff:

```powershell
npm run ai:snowflake:sonnet -- --prompt "Review the current diff and suggest the next patch" --diff
```

Explain a file:

```powershell
npm run ai:snowflake:sonnet -- --prompt "Explain this file and point out risks" --file electron/preload.cjs
```

Ask about a couple of files:

```powershell
npm run ai:snowflake:sonnet -- --prompt "Where should I add a new IPC handler?" --file electron/main.cjs --file electron/preload.cjs
```

## Interactive Chat

Start chat:

```powershell
npm run ai:snowflake:chat:sonnet -- --file README.md
```

Useful chat commands:

- `/file electron/main.cjs`
- `/dir src/store`
- `/file electron/preload.cjs`
- `/diff`
- `/review`
- `/find applyAndClose`
- `/searchfiles ocrStatus`
- `/inspect MatchRecord`
- `/tree src/components`
- `/pending`
- `/show`
- `/clear`
- `/reset`
- `/exit`

## Closest Thing To "Repo Access"

Snowflake-hosted Claude does not get true filesystem access like a local coding agent, but the chat wrapper can now gather repo context for you:

- `/dir <path>` attaches as many text files as fit from a directory
- `/searchfiles <pattern>` searches the repo and attaches matching files
- `/inspect <symbol>` attaches search hits plus likely relevant files
- `/review` attaches the current git diff and changed files

Example workflow:

```text
/dir src/store
/searchfiles applyAndClose
/inspect MatchRecord
/review
```

If you do not know what files to attach, use auto-context mode instead:

```powershell
npm run ai:snowflake:chat:auto:sonnet
```

Then just ask normal questions. The wrapper will search the repo, pick likely files, and attach them automatically for each message.

If Claude asks for exact files such as `src/components/Wizard.tsx` or `src/types.ts`, keep using the same chat and send your next normal message. In auto-context mode, the wrapper will queue those requested files and try to attach them automatically on the next turn.

## Notes

- This uses your existing Snowflake connection from `~/.snowflake/connections.toml`.
- The model is fixed to `claude-sonnet-4-6` by the npm commands below.
- If you want to override it manually, use:

```powershell
node scripts/snowflake-coder.mjs --model claude-sonnet-4-6 --prompt "..."
node scripts/snowflake-chat.mjs --model claude-sonnet-4-6
```
