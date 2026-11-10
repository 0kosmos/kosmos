<script lang="ts">
  let { title, text }: { title: string; text: string } = $props();
</script>

<h1>{title}</h1>
<p>{text}</p>

<style>
  h1 {
    margin: 0 0 8px;
    font-size: 1.6rem;
  }
  p {
    margin: 0;
    color: var(--text-dim);
  }
</style>