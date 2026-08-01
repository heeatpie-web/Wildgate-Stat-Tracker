import { addOrIncrementCategory, loadSavedCategories, removeSavedCategory } from './savedCategories';
import { useAppStore } from '../store/useAppStore';

describe('savedCategories util', () => {
  beforeEach(() => {
    // Categories now live in the app store (persisted via StorageService,
    // not raw localStorage) - reset the slice directly between tests.
    useAppStore.setState({ savedMatchCategories: [] });
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
