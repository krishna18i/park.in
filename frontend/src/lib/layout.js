export const SLOT_KINDS = ["standard", "ev", "heavy"];

/** Valet is a lot service, not a bay type. */
export function bayKind(kind) {
  return kind === "valet" ? "standard" : kind || "standard";
}

export function emptyLayout(rows, cols, kind = "standard") {
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({ row, col, kind, code: `${String.fromCharCode(65 + row)}${col + 1}` });
    }
  }
  return cells;
}

export function tally(layout) {
  const counts = { standard: 0, ev: 0, heavy: 0 };
  for (const cell of layout) {
    const kind = bayKind(cell.kind);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

/** Paint truck lanes from the back of the lot, EV columns from the left. */
export function fillByCounts(rows, cols, requested) {
  const total = rows * cols;
  let ev = Math.max(0, Math.floor(Number(requested.ev) || 0));
  let heavy = Math.max(0, Math.floor(Number(requested.heavy) || 0));

  if (heavy > total) heavy = total;
  if (ev > total - heavy) ev = total - heavy;

  const cells = emptyLayout(rows, cols, "standard");
  const at = (row, col) => cells[row * cols + col];

  let remainingHeavy = heavy;
  for (let row = rows - 1; row >= 0 && remainingHeavy > 0; row -= 1) {
    for (let col = 0; col < cols && remainingHeavy > 0; col += 1) {
      if (at(row, col).kind !== "standard") continue;
      at(row, col).kind = "heavy";
      remainingHeavy -= 1;
    }
  }

  let remainingEv = ev;
  for (let col = 0; col < cols && remainingEv > 0; col += 1) {
    for (let row = 0; row < rows && remainingEv > 0; row += 1) {
      if (at(row, col).kind !== "standard") continue;
      at(row, col).kind = "ev";
      remainingEv -= 1;
    }
  }

  return cells;
}

export function toPayload(layout) {
  return layout.map(({ row, col, kind }) => ({ row, col, kind: bayKind(kind) }));
}
