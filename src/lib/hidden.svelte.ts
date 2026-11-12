// Games you've hidden, so they don't clutter the Library or the Store. Saved on this PC.
// "Show hidden games" (in the Library's and the Store's filters) brings them back, so you can
// unhide them.
//   Library: the same keys as favorites ("s<appid>" Steam, "e<name>" Epic, "c<id>" your own)
//   Store:   Steam game numbers

const LIB_KEY = "kosmos-hidden-library";
const STORE_KEY = "kosmos-hidden-store";

function load<T>(key: string, ok: (x: unknown) => x is T): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}
const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number";

export const hidden = $state({
  library: load(LIB_KEY, isStr),
  store: load(STORE_KEY, isNum),
  showInLibrary: false, // "Show hidden games" ticked in the Library filters (not remembered)
  showInStore: false, // same in the Store
});

function save(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const isHiddenGame = (key: string) => hidden.library.includes(key);
export function toggleHiddenGame(key: string) {
  hidden.library = isHiddenGame(key) ? hidden.library.filter((k) => k !== key) : [...hidden.library, key];
  save(LIB_KEY, hidden.library);
}

export const isHiddenInStore = (appid: number) => hidden.store.includes(appid);
export function toggleHiddenInStore(appid: number) {
  hidden.store = isHiddenInStore(appid) ? hidden.store.filter((a) => a !== appid) : [...hidden.store, appid];
  save(STORE_KEY, hidden.store);
}
