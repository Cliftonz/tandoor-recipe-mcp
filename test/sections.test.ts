import { describe, it, expect } from 'vitest';
import { SectionSettingsError, parseSectionModes } from '../src/lib/sections.js';

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

  it('reports every invalid variable in one error, one line each', () => {
    expect(() => parseSectionModes({ TANDOOR_MCP_RECIPES: 'on', TANDOOR_MCP_AI: 'full', TANDOOR_MCP_FOODS: 'full' })).toThrow(
      'TANDOOR_MCP_RECIPES=on is not valid. Valid values: off, simple, full.\n' +
        'TANDOOR_MCP_AI=full is not valid. Valid values: off, on.',
    );
  });

  it('throws a SectionSettingsError so startup can tell it from other failures', () => {
    let caught: unknown;
    try {
      parseSectionModes({ TANDOOR_MCP_AI: 'maybe' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SectionSettingsError);
  });

  it('prefers a set plugin option over the old variable', () => {
    const modes = parseSectionModes({ CLAUDE_PLUGIN_OPTION_RECIPE_BOOKS: 'on', TANDOOR_MCP_RECIPE_BOOKS: 'off' });
    expect(modes.get('recipe-books')).toBe('on');
  });

  it('falls back to the old variable when the plugin option is empty or whitespace', () => {
    const modes = parseSectionModes({
      CLAUDE_PLUGIN_OPTION_RECIPES: '',
      TANDOOR_MCP_RECIPES: 'full',
      CLAUDE_PLUGIN_OPTION_MEAL_PLAN: '  ',
      TANDOOR_MCP_MEAL_PLAN: 'off',
    });
    expect(modes.get('recipes')).toBe('full');
    expect(modes.get('meal-plan')).toBe('off');
  });

  it('falls back to the saved value when the plugin option and old variable are empty', () => {
    const modes = parseSectionModes({ CLAUDE_PLUGIN_OPTION_COOKLOG: ' ', TANDOOR_MCP_COOKLOG: '' }, { cooklog: 'on' });
    expect(modes.get('cooklog')).toBe('on');
  });

  it('names the plugin option when its value is invalid', () => {
    expect(() => parseSectionModes({ CLAUDE_PLUGIN_OPTION_HOUSEHOLD_SPACE: 'full', TANDOOR_MCP_HOUSEHOLD_SPACE: 'on' })).toThrow(
      new SectionSettingsError('CLAUDE_PLUGIN_OPTION_HOUSEHOLD_SPACE=full is not valid. Valid values: off, on.'),
    );
  });
});
