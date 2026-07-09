import { describe, it, expect } from 'vitest';
import { tokens, isFuzzyMatch, findInventoryMatch } from './match.js';

describe('tokens', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokens('cordless drill')).toEqual(['cordless', 'drill']);
    expect(tokens('  circular   saw ')).toEqual(['circular', 'saw']);
    expect(tokens('')).toEqual([]);
    expect(tokens('   ')).toEqual([]);
  });
});

describe('isFuzzyMatch', () => {
  it('matches when inventory tokens are a subset of item tokens', () => {
    expect(isFuzzyMatch('cordless drill', 'drill')).toBe(true);
  });

  it('matches when item tokens are a subset of inventory tokens', () => {
    expect(isFuzzyMatch('saw', 'circular saw')).toBe(true);
  });

  it('matches on exact equality (mutual subset)', () => {
    expect(isFuzzyMatch('drill', 'drill')).toBe(true);
  });

  it('does not substring-match', () => {
    expect(isFuzzyMatch('saw', 'sawdust')).toBe(false);
  });

  it('does not match when neither token-set is a subset of the other', () => {
    expect(isFuzzyMatch('cordless drill', 'circular saw')).toBe(false);
  });

  it('does not match empty token-sets', () => {
    expect(isFuzzyMatch('', 'drill')).toBe(false);
    expect(isFuzzyMatch('drill', '')).toBe(false);
    expect(isFuzzyMatch('', '')).toBe(false);
  });
});

describe('findInventoryMatch', () => {
  const item = { normalized_name: 'cordless drill', type: 'tool' };

  it('considers same-type candidates only', () => {
    const inventory = [{ id: 5, normalized_name: 'drill', type: 'material' }];
    expect(findInventoryMatch(item, inventory)).toBe(null);
  });

  it('returns the lowest-id fuzzy match', () => {
    const inventory = [
      { id: 9, normalized_name: 'drill', type: 'tool' },
      { id: 3, normalized_name: 'drill', type: 'tool' }
    ];
    expect(findInventoryMatch(item, inventory).id).toBe(3);
  });

  it('returns null when nothing matches', () => {
    const inventory = [{ id: 1, normalized_name: 'hammer', type: 'tool' }];
    expect(findInventoryMatch(item, inventory)).toBe(null);
  });
});
