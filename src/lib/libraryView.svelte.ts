export type SortKey = "name" | "name-desc" | "hours" | "hours-asc" | "recent";

/** Status checkboxes in the library filter panel */
export type StatusKey = "installed" | "notInstalled" | "played" | "neverPlayed" | "recent";
export const STATUS_KEYS: StatusKey[] = ["installed", "notInstalled", "played", "neverPlayed", "recent"];

const KEY = "kosmos-library-view-v2";
const SORTS: SortKey[] = ["name", "name-desc", "hours", "hours-asc", "recent"];

function load() {
  let sort: SortKey = "name";
  let status: StatusKey[] = [];
  let tags: string[] = [];
  let showFilters = true;
  try {
    // v1 only had sort + an "all / played / unplayed" filter: carry those over
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("kosmos-library-view-v1");
    if (raw) {
      const saved = JSON.parse(raw);
      if (SORTS.includes(saved.sort)) sort = saved.sort;
      if (Array.isArray(saved.status)) status = saved.status.filter((s: StatusKey) => STATUS_KEYS.includes(s));
      if (Array.isArray(saved.tags)) tags = saved.tags.filter((t: unknown) => typeof t === "string");
      if (typeof saved.showFilters === "boolean") showFilters = saved.showFilters;
      if (saved.filter === "played") status = ["played"];
      if (saved.filter === "unplayed") status = ["neverPlayed"];
    }
  } catch {
    /* ignore */
  }
  return { sort, status, tags, showFilters, query: "" };
}

// Lives as long as the app is open, so going to a game and back keeps your choices
export const view = $state(load());

/** Save sort + filters (not the search text). Call from event handlers, not from effects. */
export function saveView() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ sort: view.sort, status: view.status, tags: view.tags, showFilters: view.showFilters })
    );
  } catch {
    /* ignore */
  }
}

export function toggleStatus(s: StatusKey) {
  view.status = view.status.includes(s) ? view.status.filter((x) => x !== s) : [...view.status, s];
  saveView();
}

export function toggleTag(t: string) {
  view.tags = view.tags.includes(t) ? view.tags.filter((x) => x !== t) : [...view.tags, t];
  saveView();
}

export function clearFilters() {
  view.status = [];
  view.tags = [];
  saveView();
}
