import { describe, it, expect } from 'vitest';
import { parseSectionModes } from '../src/lib/sections.js';

describe('parseSectionModes', () => {
  it('uses simple for tiered sections and off for toggle sections when nothing is set', () => {
    expect(Object.fromEntries(parseSectionModes({}))).toEqual({
      recipes: 'simple',
      'meal-plan': 'simple',
      shopping: 'simple',
      inventory: 'simple',
      foods: 'simple',
      cooklog: 'off',
      'recipe-books': 'off',
      ai: 'off',
      'import-export': 'off',
      'household-space': 'off',
      admin: 'off',
    });
  });

  it('treats an empty string as the default', () => {
    const modes = parseSectionModes({ TANDOOR_MCP_RECIPES: '', TANDOOR_MCP_AI: '' });
    expect(modes.get('recipes')).toBe('simple');
    expect(modes.get('ai')).toBe('off');
  });

  it('trims values and treats whitespace-only as the default', () => {
    const modes = parseSectionModes({ TANDOOR_MCP_RECIPES: '  full\t', TANDOOR_MCP_COOKLOG: ' on ', TANDOOR_MCP_FOODS: '   ' });
    expect(modes.get('recipes')).toBe('full');
    expect(modes.get('cooklog')).toBe('on');
    expect(modes.get('foods')).toBe('simple');
  });

  it('shows the trimmed value in the error', () => {
    expect(() => parseSectionModes({ TANDOOR_MCP_ADMIN: '  yes ' })).toThrow('TANDOOR_MCP_ADMIN=yes is not valid. Valid values: off, on.');
  });

  it('reads every section variable case-insensitively', () => {
    const modes = parseSectionModes({
      TANDOOR_MCP_RECIPES: 'FULL',
      TANDOOR_MCP_MEAL_PLAN: 'Off',
      TANDOOR_MCP_SHOPPING: 'full',
      TANDOOR_MCP_INVENTORY: 'off',
      TANDOOR_MCP_FOODS: 'Simple',
      TANDOOR_MCP_COOKLOG: 'ON',
      TANDOOR_MCP_RECIPE_BOOKS: 'on',
      TANDOOR_MCP_AI: 'On',
      TANDOOR_MCP_IMPORT_EXPORT: 'on',
      TANDOOR_MCP_HOUSEHOLD_SPACE: 'on',
      TANDOOR_MCP_ADMIN: 'oN',
    });
    expect(Object.fromEntries(modes)).toEqual({
      recipes: 'full',
      'meal-plan': 'off',
      shopping: 'full',
      inventory: 'off',
      foods: 'simple',
      cooklog: 'on',
      'recipe-books': 'on',
      ai: 'on',
      'import-export': 'on',
      'household-space': 'on',
      admin: 'on',
    });
  });

  it.each([
    ['TANDOOR_MCP_RECIPES', 'on', 'off, simple, full'],
    ['TANDOOR_MCP_INVENTORY', 'bogus', 'off, simple, full'],
    ['TANDOOR_MCP_FOODS', 'true', 'off, simple, full'],
    ['TANDOOR_MCP_COOKLOG', 'simple', 'off, on'],
    ['TANDOOR_MCP_ADMIN', 'full', 'off, on'],
    ['TANDOOR_MCP_AI', '1', 'off, on'],
  ])('rejects %s=%s naming the variable and its valid values', (envVar, value, valid) => {
    expect(() => parseSectionModes({ [envVar]: value })).toThrow(
      `${envVar}=${value} is not valid. Valid values: ${valid}.`,
    );
  });
});
