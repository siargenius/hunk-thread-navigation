# Hunk thread navigation

Use `{` and `}` to move between annotated source lines, one stop per review thread.
This extension uses Hunk's public navigation API and requires no Hunk code changes.

## Behavior

- `}` moves to the next thread's annotated line. `{` moves to the previous one.
- Navigation follows visible file order, then hunk and source-line order.
- Separate threads within the same hunk have separate stops. Replies stay with their parent thread.
- Navigation wraps at either end of the visible review.
- Deleted-line notes use the old diff side. Other notes prefer the new side.
- Separate threads at the same line have separate stops. A status notice identifies the selected thread.

The target is a source line, rather than a message card.
Notes without a source range, or whose ranges do not overlap visible hunks, have no navigation stop.
Sidecar annotations and saved user and agent notes are supported.
Reloads and file filters update the target list. Manual source-line movement updates the next starting point.

## Install

```sh
hunk extension install siargenius/hunk-thread-navigation
```

The repository is public and is not submitted to Hunk's extension directory.
No GitHub authentication is required to install it.
Hunk loads the managed installation automatically. Configure the brace bindings below, then restart Hunk.

## Load a local checkout

Add this entry to the existing paths list in `~/.config/hunk/config.toml`:

```toml
[extensions]
paths = ["/path/to/hunk-thread-navigation/hunk-thread-navigation.ts"]
```

Free the built-in braces so this extension can bind them:

```toml
[keybindings]
"hunk.review.previousAnnotatedHunk" = []
"hunk.review.nextAnnotatedHunk" = []
```

Keep any existing extension paths and keybindings. Restart Hunk to load the extension.
Commands are `hunk-thread-navigation.previousThread` and `hunk-thread-navigation.nextThread`.
The Extensions menu also exposes both commands. Hunk's built-in annotated-hunk commands remain available through its menus.

Requires Hunk extension API 27 or later. Tested on Hunk 0.24.1.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run test:integration
```

The terminal test uses an isolated configuration and temporary Git repository.
A test-only command inspects Hunk's actual current source line after each brace-key jump.
It covers multiple threads in one hunk, old/new sides, file crossing, wrapping, replies, and reloads.
Set `HUNK_BIN` when Hunk is installed outside `/opt/homebrew/bin/hunk`.
If npm skips dependency install scripts on macOS, make node-pty's spawn helper executable before testing.
