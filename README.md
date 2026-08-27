# opencode-openai-usage

An [opencode](https://opencode.ai) TUI sidebar plugin that displays your OpenAI (Codex) rate limit usage. Shows session and weekly limits with reset countdowns.

**Text mode** (default):
```
▼ OpenAI Usage
 user@example.com
 Session       31%  resets in 3h 16m
 Weekly        11%  resets in 4d 5h
```

**Bar mode** (`"displayMode": "bar"`):
```
▼ OpenAI Usage
 user@example.com
 Session  █████░░░░░░░░░   31% (3h 16m)
 Weekly   ██░░░░░░░░░░░░   11% (4d 5h)
```

## Install

Paste into your OpenCode config file (`~/.config/opencode/tui.json`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-openai-usage", { "enabled": true }]]
}
```

opencode resolves the npm package on startup automatically.

## Setup

One config file. Restart. Done.

**`~/.config/opencode/tui.json`**

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-openai-usage", { "enabled": true }]]
}
```

## Options

```json
{
  "plugin": [["opencode-openai-usage", {
    "enabled": true,
    "refreshInterval": 30,
    "displayMode": "text",
    "headerColor": "#10A37F",
    "valueColor": "#82AAFF",
    "dimColor": "#546E7A"
  }]]
}
```

| Option | Default | Description |
|---|---|---|
| `refreshInterval` | `30` | Seconds between data refreshes |
| `displayMode` | `"text"` | `"text"` shows percentage + reset time, `"bar"` shows progress bar + percentage + reset time |
| `headerColor` | theme text | Color of window labels (Session, Weekly) |
| `valueColor` | `#82AAFF` | Color of percentage values |
| `dimColor` | theme muted | Color of reset times and secondary text |

## How It Works

Spawns the Codex CLI as a local app-server and communicates via JSON-RPC over stdio:

```
1. Locate codex binary in PATH
2. Spawn: codex app-server --listen stdio://
3. Send JSON-RPC initialize handshake
4. Send: account/rateLimits/read + account/read (in parallel)
5. Parse responses → rate limits (Session + Weekly) and account email
6. Display in sidebar with color grading
```

Results are cached to disk (`~/.cache/opencode-openai-usage/last.json`) for instant startup. Background refresh keeps data current.

## Requirements

- [opencode](https://opencode.ai) with plugin support (`@opencode-ai/plugin` >= 1.4.3)
- [Codex CLI](https://openai.com/codex) installed and logged in (`codex login`)

## Development

```bash
git clone https://github.com/stevejkang/opencode-openai-usage.git
cd opencode-openai-usage
bun install
```

Run tests:

```bash
bun test
```

Type check:

```bash
bun run typecheck
```

## Manual Install

Skip npm. Copy the source files directly:

```bash
mkdir -p ~/.config/opencode/plugins/opencode-openai-usage
cp src/tui.tsx src/types.ts src/format.ts src/fetcher.ts \
   ~/.config/opencode/plugins/opencode-openai-usage/
```

Register the local path in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["./plugins/opencode-openai-usage/tui.tsx", { "enabled": true }]]
}
```

Restart opencode to activate.

## License

MIT
