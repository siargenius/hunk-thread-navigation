import type { ExtensionCommandContext, HunkExtensionAPI } from "hunkdiff/extension";
import { nextThread, threadTargets } from "./targets.ts";

/** Move between thread source anchors without changing Hunk's note rendering. */
export default function (hunk: HunkExtensionAPI) {
  let previousId: string | undefined;
  hunk.on("changeset_loaded", () => { previousId = undefined; });
  hunk.on("session_reload", () => { previousId = undefined; });

  const move = (direction: 1 | -1) => (ctx: ExtensionCommandContext) => {
    const files = ctx.selection.files;
    const targets = threadTargets(files);
    const target = nextThread(targets, files, {
      fileId: ctx.selection.file?.id ?? null,
      hunkIndex: ctx.selection.hunkIndex,
      line: ctx.selection.currentLine,
    }, direction, previousId);
    if (!target) {
      ctx.notify("No annotated thread lines in the visible files");
      return;
    }
    previousId = target.id;
    ctx.navigation.revealLine(target.fileId, target.side, target.line);
    ctx.notify(`Thread ${targets.indexOf(target) + 1}/${targets.length} · ${target.path}:${target.side === "old" ? "-" : "+"}${target.line}`);
  };

  hunk.registerCommand({ id: "previousThread", title: "Previous thread line", key: "{" }, move(-1));
  hunk.registerCommand({ id: "nextThread", title: "Next thread line", key: "}" }, move(1));
}
