import type { AgentAnnotation, ExtensionDiffFile } from "hunkdiff/extension";

interface ThreadNote extends AgentAnnotation { readonly parentId?: string; }

export interface ThreadTarget {
  readonly id: string;
  readonly fileId: string;
  readonly path: string;
  readonly fileIndex: number;
  readonly hunkIndex: number;
  readonly side: "old" | "new";
  readonly line: number;
}

export interface Position {
  readonly fileId: string | null;
  readonly hunkIndex: number | null;
  readonly line: { readonly side: "old" | "new"; readonly line: number } | null;
}

/** Build one navigable source anchor per thread from Hunk's current visible files. */
export function threadTargets(files: readonly ExtensionDiffFile[]): readonly ThreadTarget[] {
  return files.flatMap((file, fileIndex) => {
    const notes: readonly ThreadNote[] = file.agent?.annotations ?? [];
    const byId = new Map(notes.flatMap(note => note.id ? [[note.id, note] as const] : []));
    const seen = new Set<string>();
    const targets: ThreadTarget[] = [];
    notes.forEach((note, index) => {
      let root = note;
      const visited = new Set<string>();
      while (root.parentId && byId.has(root.parentId) && !visited.has(root.parentId)) {
        visited.add(root.parentId);
        root = byId.get(root.parentId)!;
      }
      const rootId = root.parentId && !byId.has(root.parentId) ? root.parentId : root.id ?? `sidecar:${index}`;
      if (seen.has(rootId)) return;
      for (const side of ["new", "old"] as const) {
        const range = side === "new" ? root.newRange : root.oldRange;
        if (!range || !Number.isInteger(range[0]) || range[0] < 1) continue;
        const hunk = file.hunks?.find(hunk => {
          const span = side === "new" ? hunk.newRange : hunk.oldRange;
          return span && span[0] <= range[1] && span[1] >= range[0] && span[1] > 0;
        });
        if (!hunk) continue;
        const span = (side === "new" ? hunk.newRange : hunk.oldRange)!;
        seen.add(rootId);
        targets.push({ id: `${file.path}\0${rootId}`, fileId: file.id, path: file.path,
          fileIndex, hunkIndex: hunk.index, side, line: Math.max(range[0], span[0], 1) });
        return;
      }
    });
    return targets.sort((a, b) => a.hunkIndex - b.hunkIndex || a.line - b.line);
  });
}

/** Continue through equal-line threads when our previous landing is still selected. */
export function nextThread(
  targets: readonly ThreadTarget[], files: readonly ExtensionDiffFile[],
  position: Position, direction: 1 | -1, previousId?: string,
): ThreadTarget | null {
  if (targets.length === 0) return null;
  const previous = targets.findIndex(target => target.id === previousId);
  if (previous >= 0) {
    const target = targets[previous]!;
    if (target.fileId === position.fileId && target.hunkIndex === position.hunkIndex &&
        position.line?.line === target.line && position.line.side === target.side) {
      return targets[(previous + direction + targets.length) % targets.length]!;
    }
  }
  const fileIndex = files.findIndex(file => file.id === position.fileId);
  if (fileIndex < 0) return (direction > 0 ? targets[0] : targets.at(-1))!;
  const candidates = targets.filter(target => {
    if (target.fileIndex !== fileIndex) return direction * (target.fileIndex - fileIndex) > 0;
    if (position.hunkIndex === null) return true;
    if (target.hunkIndex !== position.hunkIndex) return direction * (target.hunkIndex - position.hunkIndex) > 0;
    return position.line === null || direction * (target.line - position.line.line) > 0;
  });
  return (direction > 0 ? candidates[0] ?? targets[0] : candidates.at(-1) ?? targets.at(-1))!;
}
