import { describe, it, expect } from 'vitest';
import {
  slimRecipe,
  isUsableScrape,
  type ScrapedRecipe,
} from '../src/handlers/recipe.js';

describe('slimRecipe', () => {
  it('returns a flat shape with keyword names and ingredient names', () => {
    const full = {
      id: 1,
      name: 'Stew',
      description: 'Warm',
      servings: 4,
      working_time: 15,
      waiting_time: 60,
      rating: 5,
      last_cooked: '2026-01-01',
      internal: true,
      keywords: [{ id: 10, name: 'dinner' }, { id: 11, label: 'cozy' }],
      steps: [
        {
          instruction: 'Chop',
          time: 5,
          ingredients: [
            {
              id: 100,
              food: { id: 1, name: 'carrot', substitute: [{ id: 99 }] },
              unit: { id: 2, name: 'cup' },
              amount: 2,
              note: 'diced',
            },
            {
              id: 101,
              food: { id: 3, name: 'salt' },
              unit: null,
              amount: 1,
            },
          ],
        },
      ],
      // fields slim drops
      image: 'https://x/y.jpg',
      nutrition: { calories: 500 },
      shared: [{ id: 1, username: 'zac' }],
      created_by: { id: 1 },
      file_path: '/var/x',
    };

    const out = slimRecipe(full);
    expect(out.id).toBe(1);
    expect(out.name).toBe('Stew');
    expect(out.keywords).toEqual(['dinner', 'cozy']);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].ingredients[0]).toEqual({
      id: 100,
      food: 'carrot',
      unit: 'cup',
      amount: 2,
      note: 'diced',
      is_header: undefined,
    });
    expect(out.steps[0].ingredients[1]).toEqual({
      id: 101,
      food: 'salt',
      unit: undefined,
      amount: 1,
      note: undefined,
      is_header: undefined,
    });
    // must not leak dropped fields
    expect(out).not.toHaveProperty('image');
    expect(out).not.toHaveProperty('nutrition');
    expect(out).not.toHaveProperty('shared');
    expect(out).not.toHaveProperty('created_by');
  });

  it('handles missing arrays and null ingredients gracefully', () => {
    const out = slimRecipe({ id: 2, name: 'bare' });
    expect(out.keywords).toEqual([]);
    expect(out.steps).toEqual([]);
  });

  it('returns primitives through unchanged', () => {
    expect(slimRecipe(null)).toBeNull();
    expect(slimRecipe('string' as any)).toBe('string');
  });
});

describe('isUsableScrape', () => {
  it('requires name and non-empty steps', () => {
    expect(isUsableScrape(null)).toBe(false);
    expect(isUsableScrape(undefined)).toBe(false);
    expect(isUsableScrape({} as ScrapedRecipe)).toBe(false);
    expect(isUsableScrape({ name: 'x' } as ScrapedRecipe)).toBe(false);
    expect(isUsableScrape({ name: 'x', steps: [] } as ScrapedRecipe)).toBe(false);
    expect(
      isUsableScrape({ name: 'x', steps: [{ instruction: 'do' }] } as ScrapedRecipe)
    ).toBe(true);
  });
});
