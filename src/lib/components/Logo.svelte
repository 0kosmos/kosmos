<!-- The Kosmos mark: a bold "K" with an orbit and three moons.
     Drawn in the current text color, so it follows the theme. The orbit has a thin gap
     (in the sidebar's background color) where it crosses the K, which gives it depth. -->
<script lang="ts">
  let { size = 28, cut = "var(--surface)" }: { size?: number; cut?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
  <path d="M17 13h10v15l14-15h12L35 32l19 19H42L27 36v15H17z" transform="translate(35.5 32) scale(1.08) translate(-35.5 -32)" />
  <!-- The gap is left out in the top-right, so the orbit and top moon blend into the K's arm -->
  <defs>
    <clipPath id="kosmos-logo-gap"><path d="M-20-20H70.8L26.32 27.68H90V90H-20z" /></clipPath>
  </defs>
  <g clip-path="url(#kosmos-logo-gap)">
    <g transform="rotate(-28 32 32)" fill={cut}>
      <ellipse cx="32" cy="32" rx="29" ry="10" fill="none" stroke={cut} stroke-width="6" />
      <circle cx="4" cy="29.4" r="4.85" />
      <circle cx="60" cy="29.4" r="4.85" />
      <circle cx="46.5" cy="40.7" r="4.85" />
    </g>
  </g>
  <g transform="rotate(-28 32 32)">
    <ellipse cx="32" cy="32" rx="29" ry="10" fill="none" stroke="currentColor" stroke-width="2.4" />
    <circle cx="4" cy="29.4" r="3.6" />
    <circle cx="60" cy="29.4" r="3.6" />
    <circle cx="46.5" cy="40.7" r="3.6" />
  </g>
</svg>

<style>
  svg { flex-shrink: 0; overflow: visible; }
</style>
