import { addOrIncrementCategory, loadSavedCategories, removeSavedCategory } from './savedCategories';

describe('savedCategories util', () => {
  beforeEach(() => {
    // clear localStorage key
    try { localStorage.removeItem('wg_saved_match_categories_v1'); } catch {}
  });

  test('add and load', () => {
    addOrIncrementCategory('Tournament');
    addOrIncrementCategory('tournament');
    const list = loadSavedCategories();
    expect(list.length).toBe(1);
    expect(list[0].count).toBeGreaterThanOrEqual(2);
  });

  test('remove', () => {
    addOrIncrementCategory('Scrim');
    const list = loadSavedCategories();
    expect(list.some((c) => c.label.toLowerCase().includes('scrim'))).toBe(true);
    removeSavedCategory('Scrim');
    const after = loadSavedCategories();
    expect(after.some((c) => c.label.toLowerCase().includes('scrim'))).toBe(false);
  });
});
