import { describe, expect, it } from "vitest";

import { detectDuplicate } from "./detect-duplicate";
import type { DuplicateInventoryItem, DuplicateListItem } from "./types";

function stock(
  overrides: Partial<DuplicateInventoryItem> & { id: string },
): DuplicateInventoryItem {
  return {
    productId: null,
    displayName: "",
    quantity: null,
    unit: null,
    status: "active",
    ...overrides,
  };
}

function listed(
  overrides: Partial<DuplicateListItem> & { id: string },
): DuplicateListItem {
  return {
    productId: null,
    freeText: null,
    quantity: null,
    unit: null,
    status: "open",
    ...overrides,
  };
}

describe("detectDuplicate — stock in the pantry", () => {
  it("warns when the same product is already in stock", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [
        stock({
          id: "i-1",
          productId: "p-milch",
          displayName: "Vollmilch",
          quantity: 1000,
          unit: "ml",
        }),
      ],
      [],
    );
    expect(result).toEqual({
      kind: "in_stock",
      items: [
        {
          id: "i-1",
          label: "Vollmilch",
          quantity: 1000,
          unit: "ml",
          via: "productId",
        },
      ],
    });
  });

  it("reports every matching item, not only the first", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [
        stock({ id: "i-1", productId: "p-milch", displayName: "Vollmilch" }),
        stock({ id: "i-2", productId: "p-milch", displayName: "Vollmilch" }),
      ],
      [],
    );
    expect(result?.items.map((i) => i.id)).toEqual(["i-1", "i-2"]);
  });

  it("ignores consumed and discarded items", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [
        stock({
          id: "i-1",
          productId: "p-milch",
          displayName: "Vollmilch",
          status: "consumed",
        }),
        stock({
          id: "i-2",
          productId: "p-milch",
          displayName: "Vollmilch",
          status: "discarded",
        }),
      ],
      [],
    );
    expect(result).toBeNull();
  });

  it("returns null when nothing matches", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [stock({ id: "i-1", productId: "p-brot", displayName: "Brot" })],
      [],
    );
    expect(result).toBeNull();
  });
});

describe("detectDuplicate — already on the open list", () => {
  it("warns when the same product is already on the list", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [],
      [
        listed({
          id: "l-1",
          productId: "p-milch",
          freeText: "Vollmilch",
          quantity: 2,
          unit: "piece",
        }),
      ],
    );
    expect(result).toEqual({
      kind: "already_on_list",
      items: [
        {
          id: "l-1",
          label: "Vollmilch",
          quantity: 2,
          unit: "piece",
          via: "productId",
        },
      ],
    });
  });

  it("ignores checked and cancelled rows", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [],
      [
        listed({ id: "l-1", productId: "p-milch", status: "checked" }),
        listed({ id: "l-2", productId: "p-milch", status: "cancelled" }),
      ],
    );
    expect(result).toBeNull();
  });

  it("does not warn about the row being edited itself", () => {
    const row = listed({
      id: "l-1",
      productId: "p-milch",
      freeText: "Vollmilch",
    });
    expect(
      detectDuplicate({ id: "l-1", productId: "p-milch" }, [], [row]),
    ).toBeNull();
    expect(
      detectDuplicate({ id: "l-2", productId: "p-milch" }, [], [row]),
    ).not.toBeNull();
  });
});

describe("detectDuplicate — which warning wins", () => {
  const inventory = [
    stock({ id: "i-1", productId: "p-milch", displayName: "Vollmilch" }),
  ];
  const openList = [
    listed({ id: "l-1", productId: "p-milch", freeText: "Vollmilch" }),
  ];

  it("reports the list duplicate when both apply", () => {
    // The certain mistake with the unambiguous answer goes first; a second
    // litre of milk is a legitimate wish, a second list row never is.
    const result = detectDuplicate(
      { productId: "p-milch" },
      inventory,
      openList,
    );
    expect(result?.kind).toBe("already_on_list");
    expect(result?.items.map((i) => i.id)).toEqual(["l-1"]);
  });

  it("falls through to the stock warning once the list row is checked off", () => {
    const checked = [
      listed({ id: "l-1", productId: "p-milch", status: "checked" }),
    ];
    const result = detectDuplicate(
      { productId: "p-milch" },
      inventory,
      checked,
    );
    expect(result?.kind).toBe("in_stock");
  });
});

describe("detectDuplicate — free text entries", () => {
  it("matches free text against a stocked item by normalized name", () => {
    const result = detectDuplicate(
      { freeText: "vollmilch" },
      [stock({ id: "i-1", displayName: "M-Classic Vollmilch 1L" })],
      [],
    );
    expect(result?.kind).toBe("in_stock");
    expect(result?.items[0]?.via).toBe("normalizedName");
  });

  it("sees through case, brand noise and quantity", () => {
    const inventory = [stock({ id: "i-1", displayName: "Vollmilch" })];
    for (const text of [
      "VOLLMILCH",
      "M-Classic Vollmilch",
      "Vollmilch 1L",
      "  vollmilch  ",
      "Bio Vollmilch 1.5l",
    ]) {
      expect(
        detectDuplicate({ freeText: text }, inventory, []),
        text,
      ).not.toBeNull();
    }
  });

  it("matches the plural on the list against the singular in the pantry", () => {
    const result = detectDuplicate(
      { freeText: "Bananen" },
      [stock({ id: "i-1", displayName: "Banane" })],
      [],
    );
    expect(result?.kind).toBe("in_stock");
  });

  it("does not match two different free texts", () => {
    expect(
      detectDuplicate(
        { freeText: "Vollrahm" },
        [stock({ id: "i-1", displayName: "Halbrahm" })],
        [],
      ),
    ).toBeNull();
  });

  it("matches free text against free text on the list", () => {
    const result = detectDuplicate(
      { freeText: "WC-Papier" },
      [],
      [listed({ id: "l-1", freeText: "wc papier" })],
    );
    expect(result?.kind).toBe("already_on_list");
    expect(result?.items[0]?.via).toBe("normalizedName");
  });

  it("prefers the product id over the name when both would match", () => {
    const result = detectDuplicate(
      { productId: "p-milch", freeText: "Vollmilch" },
      [
        stock({
          id: "i-1",
          productId: "p-milch",
          displayName: "Etwas ganz anderes",
        }),
      ],
      [],
    );
    expect(result?.items[0]?.via).toBe("productId");
  });

  it("never matches on an empty normalized name", () => {
    // "1L" and "   " normalize to nothing; they must not match each other.
    expect(
      detectDuplicate(
        { freeText: "1L" },
        [stock({ id: "i-1", displayName: "500g" })],
        [],
      ),
    ).toBeNull();
    expect(
      detectDuplicate(
        { freeText: "Milch" },
        [stock({ id: "i-1", displayName: "" })],
        [],
      ),
    ).toBeNull();
  });

  it("does not match a free text entry against an unrelated product id", () => {
    expect(
      detectDuplicate(
        { freeText: "Vollmilch" },
        [stock({ id: "i-1", productId: "p-brot", displayName: "Brot" })],
        [],
      ),
    ).toBeNull();
  });
});

describe("detectDuplicate — defensive handling", () => {
  it("returns null for a candidate that identifies nothing", () => {
    const inventory = [
      stock({ id: "i-1", productId: "p-milch", displayName: "Milch" }),
    ];
    expect(detectDuplicate({}, inventory, [])).toBeNull();
    expect(
      detectDuplicate({ productId: null, freeText: null }, inventory, []),
    ).toBeNull();
    expect(detectDuplicate({ freeText: "   " }, inventory, [])).toBeNull();
    expect(
      detectDuplicate(null as unknown as { productId: string }, inventory, []),
    ).toBeNull();
  });

  it("handles empty inventory and list", () => {
    expect(detectDuplicate({ productId: "p-milch" }, [], [])).toBeNull();
  });

  it("survives malformed rows", () => {
    const inventory = [
      null as unknown as DuplicateInventoryItem,
      { productId: "p-milch" } as unknown as DuplicateInventoryItem, // no id
      stock({ id: "i-good", productId: "p-milch", displayName: "Milch" }),
    ];
    const result = detectDuplicate({ productId: "p-milch" }, inventory, []);
    expect(result?.items.map((i) => i.id)).toEqual(["i-good"]);
  });

  it("falls back to the product id as a label when the name is missing", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [stock({ id: "i-1", productId: "p-milch", displayName: "   " })],
      [],
    );
    expect(result?.items[0]?.label).toBe("p-milch");
  });

  it("normalises a missing quantity to null rather than undefined", () => {
    const result = detectDuplicate(
      { productId: "p-milch" },
      [
        {
          id: "i-1",
          productId: "p-milch",
          displayName: "Milch",
          status: "active",
        },
      ],
      [],
    );
    expect(result?.items[0]).toEqual({
      id: "i-1",
      label: "Milch",
      quantity: null,
      unit: null,
      via: "productId",
    });
  });

  it("does not mutate its inputs", () => {
    const inventory = [
      stock({ id: "i-1", productId: "p-milch", displayName: "Milch" }),
    ];
    const openList = [listed({ id: "l-1", productId: "p-milch" })];
    const snapshot = JSON.parse(JSON.stringify({ inventory, openList }));
    detectDuplicate({ productId: "p-milch" }, inventory, openList);
    expect({ inventory, openList }).toEqual(snapshot);
  });
});
