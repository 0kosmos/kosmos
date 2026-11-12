<!-- Add a game you picked, or edit one you added: name, cover picture, and its size.
     Adding: "Skip" adds it right away with the file's name and no picture.
     Editing: change name / picture, or remove it from the Library (the game itself isn't touched). -->
<script lang="ts">
  import { untrack } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import {
    type CustomGame, type FileInfo, fileInfo, saveCover, saveIcon, cleanCovers, addGame, updateGame, removeGame,
    newId, coverUrl, fmtBytes,
  } from "$lib/customGames.svelte";

  // Either a new file to add (`path`), or a game to edit (`game`)
  let { path = "", game = null, onclose }: { path?: string; game?: CustomGame | null; onclose: () => void } = $props();

  // The window is made fresh each time it opens, so its starting values are read once
  const start = untrack(() => ({ game, path }));
  const editing = !!start.game;
  const id = start.game?.id ?? newId();
  const target = start.game?.path ?? start.path;
  const fileName = target.split(/[\\/]/).pop() ?? target;

  let name = $state(start.game?.name ?? "");
  let cover = $state(start.game?.cover ?? "");
  // The app's own icon (taken from the file); used as the picture unless you pick one
  let icon = $state(start.game?.coverIsIcon ? (start.game?.cover ?? "") : "");
  const usingIcon = $derived(!!cover && cover === icon);
  saveIcon(target, id)
    .then((path) => {
      if (!path) return;
      icon = path;
      if (!cover) cover = path; // no picture yet: use the icon
    })
    .catch(() => {});
  let info = $state<FileInfo | null>(null);
  let error = $state("");

  // Size (and a starting name when adding). Measuring a big game folder can take a moment.
  fileInfo(target)
    .then((i) => {
      info = i;
      if (!editing && !name) name = i.name;
    })
    .catch(() => {});

  async function pickPicture() {
    error = "";
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Pictures", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    }).catch(() => null);
    if (typeof file !== "string") return;
    try {
      cover = await saveCover(file, id);
    } catch (e) {
      error = String(e);
    }
  }

  function finish(withChoices: boolean) {
    const finalName = (withChoices ? name.trim() : "") || info?.name || fileName.replace(/\.[^.]+$/, "");
    // Skip keeps the app's icon (no letter tile)
    const finalCover = withChoices ? cover : icon;
    const sizes = { fileBytes: info?.fileBytes ?? start.game?.fileBytes ?? 0, folderBytes: info?.folderBytes ?? start.game?.folderBytes ?? 0 };
    const isIcon = !!finalCover && finalCover === icon;
    if (editing) updateGame(id, { name: finalName, cover: finalCover, coverIsIcon: isIcon, iconTried: true, ...sizes });
    else addGame({ id, name: finalName, path: target, cover: finalCover, coverIsIcon: isIcon, iconTried: true, ...sizes, added: Date.now() });
    cleanCovers(id, finalCover); // remove pictures you tried but didn't keep
    onclose();
  }

  function cancel() {
    cleanCovers(id, editing ? (start.game?.cover ?? "") : ""); // keep only what was there before
    onclose();
  }

  function remove() {
    removeGame(id);
    onclose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") cancel();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cg-title">
    <button class="x" onclick={cancel} aria-label="Close">✕</button>
    <h2 id="cg-title">{editing ? "Edit game" : "Add a game"}</h2>
    <p class="file" title={target}>{fileName}</p>

    <div class="body">
      <!-- Cover picture (click to pick one) -->
      <button class="cover" onclick={pickPicture} title="Pick a picture">
        {#if cover}
          <img class:icon={usingIcon} src={coverUrl(cover)} alt="" />
        {:else}
          <span>+ Picture</span>
        {/if}
      </button>

      <div class="fields">
        <label class="field">
          <span>Name</span>
          <input type="text" bind:value={name} maxlength="80" placeholder={info?.name || "Game name"} />
        </label>

        <div class="field">
          <span>Picture</span>
          <div class="row">
            <button class="ghost" onclick={pickPicture}>{cover && !usingIcon ? "Change picture" : "Choose picture"}</button>
            {#if icon && !usingIcon}
              <button class="ghost" onclick={() => (cover = icon)}>Use app icon</button>
            {:else if cover}
              <button class="ghost" onclick={() => (cover = "")}>Remove</button>
            {/if}
          </div>
          <small>{usingIcon ? "Using the app's own icon. A tall picture (like a game box) looks best." : "A tall picture works best (like a game box)."}</small>
        </div>

        <div class="field">
          <span>Size</span>
          {#if !info}
            <small>Measuring...</small>
          {:else if !info.exists}
            <small class="err">The file isn't there anymore.</small>
          {:else}
            <small>
              {#if info.folderBytes}Folder {fmtBytes(info.folderBytes)} · {/if}File {fmtBytes(info.fileBytes)}
            </small>
          {/if}
        </div>
      </div>
    </div>

    {#if error}<p class="err">{error}</p>{/if}

    <div class="actions">
      {#if editing}
        <button class="danger" onclick={remove}>Remove from Library</button>
        <span class="spacer"></span>
        <button class="ghost" onclick={cancel}>Cancel</button>
        <button class="primary" onclick={() => finish(true)}>Save</button>
      {:else}
        <span class="spacer"></span>
        <button class="ghost" onclick={() => finish(false)} title="Add it with its file name and no picture">Skip</button>
        <button class="primary" onclick={() => finish(true)}>Add game</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 50;
    display: grid; place-items: center; padding: 16px;
    background: var(--scrim);
  }
  .dialog {
    position: relative; width: min(520px, 100%); max-height: calc(100vh - 32px); overflow-y: auto;
    padding: 22px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 16px 48px var(--scrim);
  }
  .x {
    position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
    border-radius: var(--radius-sm); background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  }
  .x:hover { color: var(--text); border-color: var(--text-dim); }
  h2 { margin: 0 0 2px; font-size: 1.2rem; font-weight: 700; }
  .file { margin: 0 0 16px; font-size: var(--fs-sm); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 30px; }

  .body { display: flex; gap: 18px; }
  .cover {
    flex-shrink: 0; width: 120px; aspect-ratio: 2 / 3; padding: 0; overflow: hidden;
    border-radius: var(--radius-sm); border: 1px dashed var(--border); background: var(--surface-2);
    color: var(--text-dim); font-size: var(--fs-sm); display: grid; place-items: center;
  }
  .cover:hover { border-color: var(--text-dim); color: var(--text); }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover img.icon { width: 72px; height: 72px; object-fit: contain; }
  .fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field > span { font-size: var(--fs-sm); font-weight: 600; }
  .field input { width: 100%; }
  small { color: var(--text-dim); font-size: 0.78rem; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .err { color: var(--bad); font-size: var(--fs-sm); margin: 10px 0 0; }
  small.err { margin: 0; }

  .actions { display: flex; gap: 8px; margin-top: 20px; align-items: center; }
  .spacer { flex: 1; }
  button.ghost, button.primary, button.danger {
    padding: 7px 14px; border-radius: var(--radius); font-size: var(--fs-md);
  }
  .ghost { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .ghost:hover { border-color: var(--text-dim); }
  .primary { background: var(--accent); color: var(--on-accent); border: none; font-weight: 600; }
  .primary:hover { filter: brightness(1.1); }
  .danger { background: transparent; border: 1px solid var(--border); color: var(--bad); }
  .danger:hover { border-color: var(--bad); }
</style>
