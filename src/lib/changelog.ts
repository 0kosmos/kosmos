// What changed in each version, shown once in the "What's new" pop-up after an update
// (newest first). When publishing a new version, add an entry for it at the top.

export interface Release {
  version: string;
  new: string[];
  improved: string[];
  fixed: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "0.2.0",
    new: [
      "Inventory: your Steam items for every game, with Community Market prices and what your inventory is worth.",
      "Screenshots: all your Steam screenshots in one place. Save them, send them to a friend, or open them in Steam. Small, medium and large views.",
      "Wishlists: save games from the Store and items from the Market with ♡, and see them all with the Wishlist button.",
      "Add your own games and apps to the Library with the + button, with your own name and picture.",
      "Hide games you don't want to see in the Library or the Store (\"Show hidden games\" in the filters brings them back).",
      "Discord activity: Discord shows that you're using Kosmos and what you're looking at (Settings → General).",
      "Coming soon in the Store: upcoming games with their release date, to wishlist them on Steam.",
      "A welcome setup the first time Kosmos starts, and this \"What's new\" window after updates.",
    ],
    improved: [
      "Kosmos opens a bit taller, so the news row in the Library shows right away.",
      "Hidden tabs don't do anything in the background.",
      "The Market stops waiting after 20 seconds if Steam doesn't answer, with a Try again button.",
    ],
    fixed: [
      "The \"hidden tabs\" link in the sidebar now opens the right page in Settings.",
      "The game count on Discord now includes your Epic games and your own games.",
    ],
  },
];
