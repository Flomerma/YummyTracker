import { normalizeName } from "./normalize-name";
import type {
  DuplicateCandidate,
  DuplicateInventoryItem,
  DuplicateListItem,
  DuplicateMatch,
  DuplicateWarning,
} from "./types";

/**
 * `detectDuplicate` — the warning that fires when somebody adds something to
 * the shopping list.
 *
 * Two different mistakes are caught:
 *
 * - `'already_on_list'` — the same thing is already on the open list. Somebody
 *   else added it half an hour ago.
 * - `'in_stock'` — there is still an active item of this kind in the pantry.
 *   This is the double-purchase problem from section 3.2.
 *
 * ## Why the list wins when both apply
 *
 * Only one warning is returned, so the two have to be ranked.
 *
 * `'already_on_list'` goes first. It is the *certain* mistake with the
 * *unambiguous* answer: adding a second row for something already on the list
 * is never what anyone wanted, and the correct reaction is simply "don't".
 * Having stock at home is a softer signal — a family may well want a second
 * litre of milk even though one is in the fridge. Showing the certain problem
 * first keeps the warning credible; a warning that cries wolf gets dismissed
 * reflexively, and then the one that mattered goes unread too.
 *
 * ## Matching
 *
 * Two entries are the same thing if their `product_id` matches, or — for the
 * free-text entries the concept explicitly allows — if their normalized names
 * match. Product id is checked first and reported as `via: 'productId'`, so
 * the caller can tell a certain match from a name-based guess.
 *
 * Only `active` inventory and `open` list rows count. Consumed, discarded,
 * checked and cancelled rows are history and must not produce warnings.
 */
export function detectDuplicate(
  candidate: DuplicateCandidate,
  inventory: readonly DuplicateInventoryItem[],
  openList: readonly DuplicateListItem[],
): DuplicateWarning | null {
  if (!candidate) return null;

  const candidateProductId =
    typeof candidate.productId === "string" && candidate.productId.length > 0
      ? candidate.productId
      : null;
  const candidateName = normalizeName(
    typeof candidate.freeText === "string" ? candidate.freeText : "",
  );

  // Nothing identifiable — the database constraint forbids this row anyway.
  if (candidateProductId === null && candidateName.length === 0) return null;

  const listMatches = collectListMatches(
    candidate,
    candidateProductId,
    candidateName,
    openList,
  );
  if (listMatches.length > 0) {
    return { kind: "already_on_list", items: listMatches };
  }

  const stockMatches = collectStockMatches(
    candidateProductId,
    candidateName,
    inventory,
  );
  if (stockMatches.length > 0) {
    return { kind: "in_stock", items: stockMatches };
  }

  return null;
}

function matchVia(
  candidateProductId: string | null,
  candidateName: string,
  otherProductId: string | null | undefined,
  otherName: string,
): DuplicateMatch["via"] | null {
  if (
    candidateProductId !== null &&
    typeof otherProductId === "string" &&
    otherProductId === candidateProductId
  ) {
    return "productId";
  }
  if (
    candidateName.length > 0 &&
    otherName.length > 0 &&
    otherName === candidateName
  ) {
    return "normalizedName";
  }
  return null;
}

function collectListMatches(
  candidate: DuplicateCandidate,
  candidateProductId: string | null,
  candidateName: string,
  openList: readonly DuplicateListItem[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const selfId = typeof candidate.id === "string" ? candidate.id : null;

  for (const item of openList ?? []) {
    if (!item || typeof item.id !== "string") continue;
    if (item.status !== "open") continue;
    if (selfId !== null && item.id === selfId) continue; // editing its own row

    const label = typeof item.freeText === "string" ? item.freeText : "";
    const via = matchVia(
      candidateProductId,
      candidateName,
      item.productId,
      normalizeName(label),
    );
    if (via === null) continue;

    matches.push({
      id: item.id,
      label:
        label.trim().length > 0 ? label.trim() : (item.productId ?? item.id),
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      via,
    });
  }
  return matches;
}

function collectStockMatches(
  candidateProductId: string | null,
  candidateName: string,
  inventory: readonly DuplicateInventoryItem[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const item of inventory ?? []) {
    if (!item || typeof item.id !== "string") continue;
    if (item.status !== "active") continue;

    const label = typeof item.displayName === "string" ? item.displayName : "";
    const via = matchVia(
      candidateProductId,
      candidateName,
      item.productId,
      normalizeName(label),
    );
    if (via === null) continue;

    matches.push({
      id: item.id,
      label:
        label.trim().length > 0 ? label.trim() : (item.productId ?? item.id),
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      via,
    });
  }
  return matches;
}
