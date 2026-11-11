<!-- The "Sign in through Steam" box, shared by Library, Friends and Groups.
     After you finish in the browser, every page that needs your account loads on its own. -->
<script lang="ts">
  import { auth, startSignIn, cancelSignIn } from "$lib/auth.svelte";

  let { title = "Sign in to see your games" }: { title?: string } = $props();
</script>

<div class="card">
  {#if auth.waiting}
    <h2>Finish signing in in your browser</h2>
    <p class="dim">
      Steam's login page is open in your browser. When you're done there, Kosmos will continue
      on its own.
    </p>
    <div class="row">
      <button class="primary" onclick={startSignIn}>Open the login page again</button>
      <button class="ghost" onclick={cancelSignIn}>Cancel</button>
    </div>
  {:else}
    <h2>{title}</h2>
    <p class="dim">
      You'll sign in on Steam's own website in your browser. Kosmos never sees or stores your
      password.
    </p>
    <button class="primary" onclick={startSignIn}>Sign in through Steam</button>
  {/if}
  {#if auth.error}<p class="err">{auth.error}</p>{/if}
</div>

<style>
  .card {
    max-width: 520px;
    padding: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  h2 { margin: 0 0 8px; font-size: 1.3rem; font-weight: 700; }
  p { margin: 0 0 16px; }
  .dim { color: var(--text-dim); }
  .err { color: var(--bad); margin: 12px 0 0; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  button.primary {
    background: var(--accent);
    color: var(--on-accent);
    border: none;
    border-radius: var(--radius);
    padding: 8px 16px;
    font-weight: 600;
    transition: filter 0.15s;
  }
  button.primary:hover { filter: brightness(1.1); }
  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    font-size: var(--fs-md);
    color: var(--text-dim);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  button.ghost:hover { background: var(--hover); color: var(--text); border-color: var(--text-dim); }
</style>
