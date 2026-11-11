export type SortKey = "name" | "name-desc" | "hours" | "hours-asc" | "recent";
export type PlayFilter = "all" | "played" | "unplayed";

const KEY = "kosmos-library-view-v1";
const SORTS: SortKey[] = ["name", "name-desc", "hours", "hours-asc", "recent"];
const FILTERS: PlayFilter[] = ["all", "played", "unplayed"];

function load() {
  let sort: SortKey = "name";
  let filter: PlayFilter = "all";
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (SORTS.includes(saved.sort)) sort = saved.sort;
      if (FILTERS.includes(saved.filter)) filter = saved.filter;
    }
  } catch {
    /* ignore */
  }
  return { sort, filter, query: "" };
}

// Lives as long as the app is open, so going to a game and back keeps your choices
export const view = $state(load());

export function saveView(sort: SortKey, filter: PlayFilter) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sort, filter }));
  } catch {
    /* ignore */
  }
}