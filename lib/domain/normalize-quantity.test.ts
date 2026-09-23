import { describe, expect, it } from 'vitest';

import {
  MASS_TO_G,
  PIECE_UNITS,
  VOLUME_TO_ML,
  normalizeQuantity,
} from './normalize-quantity';

describe('normalizeQuantity — mass', () => {
  it('converts kilograms to grams', () => {
    expect(normalizeQuantity(1, 'kg')).toEqual({ qty: 1000, unit: 'g' });
    expect(normalizeQuantity(1.5, 'kg')).toEqual({ qty: 1500, unit: 'g' });
    expect(normalizeQuantity(0.5, 'kg')).toEqual({ qty: 500, unit: 'g' });
  });

  it('leaves grams alone', () => {
    expect(normalizeQuantity(250, 'g')).toEqual({ qty: 250, unit: 'g' });
    expect(normalizeQuantity(250, 'gr')).toEqual({ qty: 250, unit: 'g' });
    expect(normalizeQuantity(250, 'Gramm')).toEqual({ qty: 250, unit: 'g' });
  });

  it('converts milligrams without rounding them away', () => {
    expect(normalizeQuantity(500, 'mg')).toEqual({ qty: 0.5, unit: 'g' });
  });
});

describe('normalizeQuantity — volume', () => {
  it('converts litres to millilitres', () => {
    expect(normalizeQuantity(1, 'l')).toEqual({ qty: 1000, unit: 'ml' });
    expect(normalizeQuantity(1.5, 'L')).toEqual({ qty: 1500, unit: 'ml' });
    expect(normalizeQuantity(0.33, 'l')).toEqual({ qty: 330, unit: 'ml' });
  });

  it('converts the Swiss deciliter and centiliter', () => {
    // "2dl Halbrahm" is on every second Coop receipt.
    expect(normalizeQuantity(2, 'dl')).toEqual({ qty: 200, unit: 'ml' });
    expect(normalizeQuantity(33, 'cl')).toEqual({ qty: 330, unit: 'ml' });
  });

  it('leaves millilitres alone', () => {
    expect(normalizeQuantity(200, 'ml')).toEqual({ qty: 200, unit: 'ml' });
  });
});

describe('normalizeQuantity — pieces', () => {
  it('maps every spelling of "piece" onto piece', () => {
    for (const unit of ['Stk', 'Stk.', 'Stück', 'Stueck', 'St', 'Pcs', 'pc', 'x', 'er']) {
      expect(normalizeQuantity(6, unit), `unit: ${unit}`).toEqual({
        qty: 6,
        unit: 'piece',
      });
    }
  });

  it('falls back to piece for unknown units, keeping the amount', () => {
    expect(normalizeQuantity(3, 'Bund')).toEqual({ qty: 3, unit: 'piece' });
    expect(normalizeQuantity(2, 'Kiste')).toEqual({ qty: 2, unit: 'piece' });
    expect(normalizeQuantity(1, '')).toEqual({ qty: 1, unit: 'piece' });
    expect(normalizeQuantity(1, '???')).toEqual({ qty: 1, unit: 'piece' });
  });

  it('falls back to piece for non-string units', () => {
    expect(normalizeQuantity(4, null as unknown as string)).toEqual({
      qty: 4,
      unit: 'piece',
    });
    expect(normalizeQuantity(4, undefined as unknown as string)).toEqual({
      qty: 4,
      unit: 'piece',
    });
  });
});

describe('normalizeQuantity — unit spelling', () => {
  it('ignores case, spacing and trailing dots', () => {
    expect(normalizeQuantity(1, 'KG')).toEqual(normalizeQuantity(1, 'kg'));
    expect(normalizeQuantity(1, ' kg ')).toEqual(normalizeQuantity(1, 'kg'));
    expect(normalizeQuantity(1, 'kg.')).toEqual(normalizeQuantity(1, 'kg'));
    expect(normalizeQuantity(1, 'Kg')).toEqual(normalizeQuantity(1, 'kg'));
  });

  it('understands umlauts in the unit', () => {
    expect(normalizeQuantity(2, 'Stück')).toEqual(normalizeQuantity(2, 'Stueck'));
  });
});

describe('normalizeQuantity — numeric edge cases', () => {
  it('turns a non-finite amount into zero instead of leaking NaN', () => {
    expect(normalizeQuantity(Number.NaN, 'kg')).toEqual({ qty: 0, unit: 'g' });
    expect(normalizeQuantity(Number.POSITIVE_INFINITY, 'l')).toEqual({
      qty: 0,
      unit: 'ml',
    });
    expect(normalizeQuantity(null as unknown as number, 'g')).toEqual({
      qty: 0,
      unit: 'g',
    });
  });

  it('keeps zero as zero', () => {
    expect(normalizeQuantity(0, 'kg')).toEqual({ qty: 0, unit: 'g' });
  });

  it('passes negative amounts through — a receipt correction is a real thing', () => {
    expect(normalizeQuantity(-1, 'kg')).toEqual({ qty: -1000, unit: 'g' });
  });

  it('does not leak binary floating point noise into the result', () => {
    // 0.07 * 100 is 7.000000000000001 in IEEE 754.
    expect(normalizeQuantity(0.07, 'l')).toEqual({ qty: 70, unit: 'ml' });
    expect(normalizeQuantity(0.07, 'dl')).toEqual({ qty: 7, unit: 'ml' });
    expect(normalizeQuantity(1.1, 'kg')).toEqual({ qty: 1100, unit: 'g' });
    expect(Number.isInteger(normalizeQuantity(0.07, 'dl').qty)).toBe(true);
  });
});

describe('normalizeQuantity — invariants', () => {
  it('never returns a unit outside the canonical three', () => {
    const units = ['kg', 'g', 'mg', 'l', 'dl', 'cl', 'ml', 'Stk', 'Bund', '', 'ø'];
    for (const unit of units) {
      expect(['piece', 'g', 'ml']).toContain(normalizeQuantity(1, unit).unit);
    }
  });

  it('is idempotent — normalizing a canonical pair changes nothing', () => {
    for (const [qty, unit] of [
      [1.5, 'kg'],
      [2, 'dl'],
      [6, 'Stk'],
      [3, 'Bund'],
    ] as const) {
      const once = normalizeQuantity(qty, unit);
      expect(normalizeQuantity(once.qty, once.unit)).toEqual(once);
    }
  });

  it('the three unit tables do not overlap', () => {
    for (const key of Object.keys(MASS_TO_G)) {
      expect(VOLUME_TO_ML, `mass unit "${key}"`).not.toHaveProperty(key);
      expect(PIECE_UNITS.has(key), `mass unit "${key}"`).toBe(false);
    }
    for (const key of Object.keys(VOLUME_TO_ML)) {
      expect(PIECE_UNITS.has(key), `volume unit "${key}"`).toBe(false);
    }
  });
});
