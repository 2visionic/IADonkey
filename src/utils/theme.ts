export interface ColorPreset {
  name: string;
  hex: string;
  isDefault?: 'primary' | 'secondary' | boolean;
}

export const DEFAULT_PRIMARY_COLOR = '#6366f1';
export const DEFAULT_ACTIONS_COLOR = '#a855f7';
export const VSCODE_EXTENSION_COLOR = '#0e7490';

export const APP_COLOR_PRESETS: readonly ColorPreset[] = [
  { name: 'Indigo', hex: '#6366f1', isDefault: 'primary' },
  { name: 'Fialová', hex: '#a855f7', isDefault: 'secondary' },
  { name: 'Královská modrá', hex: '#2563eb' },
  { name: 'Safírová modrá', hex: '#1d4ed8' },
  { name: 'Nebeská modrá', hex: '#0284c7' },
  { name: 'Ocelově modrá', hex: '#334155' },
  { name: 'Pomerančová', hex: '#ea580c' },
  { name: 'Cihlově měděná', hex: '#c2410c' },
  { name: 'Sytě růžová', hex: '#db2777' },
  { name: 'Fuchsiová', hex: '#c026d3' },
  { name: 'Břidlicová', hex: '#475569' },
  { name: 'Grafitová', hex: '#52525b' },
] as const;

/**
 * Applies the primary accent color across the application.
 * Directly injects and updates dynamic CSS rules with !important to guarantee
 * immediate real-time styling without relying on bundler reloads.
 */
export function applyPrimaryColor(hexColor?: string) {
  const hex = (hexColor || '#6366f1').trim();
  const validHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : '#6366f1';

  let fullHex = validHex;
  if (fullHex.length === 4) {
    fullHex = '#' + fullHex[1] + fullHex[1] + fullHex[2] + fullHex[2] + fullHex[3] + fullHex[3];
  }

  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);

  // Lighter tint for text / icons on dark backgrounds
  const rLighter = Math.min(255, Math.round(r + (255 - r) * 0.25));
  const gLighter = Math.min(255, Math.round(g + (255 - g) * 0.25));
  const bLighter = Math.min(255, Math.round(b + (255 - b) * 0.25));
  const hexLighter = `#${rLighter.toString(16).padStart(2, '0')}${gLighter.toString(16).padStart(2, '0')}${bLighter.toString(16).padStart(2, '0')}`;

  // Darker shade for active / pressed buttons
  const rDarker = Math.round(r * 0.82);
  const gDarker = Math.round(g * 0.82);
  const bDarker = Math.round(b * 0.82);
  const hexDarker = `#${rDarker.toString(16).padStart(2, '0')}${gDarker.toString(16).padStart(2, '0')}${bDarker.toString(16).padStart(2, '0')}`;

  // Set standard root variables
  const root = document.documentElement;
  root.style.setProperty('--color-primary-hex', fullHex);
  root.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--color-primary-lighter-rgb', `${rLighter}, ${gLighter}, ${bLighter}`);
  root.style.setProperty('--color-primary-500-rgb', `${r} ${g} ${b}`);
  root.style.setProperty('--color-primary-400-rgb', `${rLighter} ${gLighter} ${bLighter}`);
  root.style.setProperty('--color-primary-300-rgb', `${rLighter} ${gLighter} ${bLighter}`);
  root.style.setProperty('--color-primary-600-rgb', `${rDarker} ${gDarker} ${bDarker}`);

  // Create or update dedicated dynamic stylesheet
  let styleEl = document.getElementById('iadonkey-dynamic-theme') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'iadonkey-dynamic-theme';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    /* Primary buttons & cards with opacity */
    .bg-indigo-600,
    .bg-indigo-500 {
      background-color: ${fullHex} !important;
    }
    .bg-indigo-600\\/70,
    .bg-indigo-500\\/70 {
      background-color: rgba(${r}, ${g}, ${b}, 0.7) !important;
    }
    .hover\\:bg-indigo-600\\/85:hover,
    .hover\\:bg-indigo-500\\/85:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }
    .bg-indigo-600\\/85,
    .bg-indigo-500\\/85 {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }
    .hover\\:bg-indigo-500:hover,
    .hover\\:bg-indigo-600:hover {
      background-color: ${hexLighter} !important;
    }
    .active\\:bg-indigo-700:active {
      background-color: ${hexDarker} !important;
    }

    /* MagicPlan Timeline dev task (clean flat solid color) */
    .timeline-task-dev {
      background-color: rgba(${r}, ${g}, ${b}, 0.70) !important;
    }
    .timeline-task-dev:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }

    /* Primary texts & icons */
    .text-indigo-400,
    .text-indigo-300,
    .text-indigo-200 {
      color: ${hexLighter} !important;
    }

    /* Borders & outlines */
    .border-indigo-500,
    .border-indigo-400 {
      border-color: ${fullHex} !important;
    }
    .border-t-indigo-500,
    .border-t-indigo-400 {
      border-top-color: ${fullHex} !important;
    }
    .focus\\:border-indigo-500:focus,
    .focus-within\\:border-indigo-500:focus-within {
      border-color: ${fullHex} !important;
    }

    /* Selected spotlight row */
    .bg-indigo-600\\/30 {
      background-color: rgba(${r}, ${g}, ${b}, 0.28) !important;
    }
    .border-indigo-500\\/50,
    .border-indigo-500\\/40 {
      border-color: rgba(${r}, ${g}, ${b}, 0.5) !important;
    }
    .hover\\:border-indigo-500:hover,
    .hover\\:border-indigo-400:hover {
      border-color: ${fullHex} !important;
    }

    /* Subitems chips, option badges & outline buttons */
    .bg-indigo-500\\/10 {
      background-color: rgba(${r}, ${g}, ${b}, 0.1) !important;
    }
    .bg-indigo-500\\/15 {
      background-color: rgba(${r}, ${g}, ${b}, 0.15) !important;
    }
    .hover\\:bg-indigo-500\\/20:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.2) !important;
    }
    .hover\\:bg-indigo-500\\/25:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.25) !important;
    }
    .bg-indigo-500\\/20 {
      background-color: rgba(${r}, ${g}, ${b}, 0.2) !important;
    }
    .hover\\:bg-indigo-500\\/35:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.35) !important;
    }
    .border-indigo-500\\/30,
    .border-indigo-500\\/25,
    .border-indigo-500\\/20 {
      border-color: rgba(${r}, ${g}, ${b}, 0.35) !important;
    }

    /* Navigation banners & headers */
    .bg-indigo-950\\/40 {
      background-color: rgba(${r}, ${g}, ${b}, 0.18) !important;
    }
    .hover\\:bg-indigo-900\\/40:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.28) !important;
    }

    /* Gradients */
    .from-indigo-500 {
      --tw-gradient-from: ${fullHex} var(--tw-gradient-from-position) !important;
      --tw-gradient-to: rgba(${r}, ${g}, ${b}, 0) var(--tw-gradient-to-position) !important;
      --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
    }

    /* Rings */
    .ring-indigo-500\\/50 {
      --tw-ring-color: rgba(${r}, ${g}, ${b}, 0.5) !important;
    }

    /* Material 3 Expressive tokens */
    .m3-selected-card {
      background-color: rgba(${r}, ${g}, ${b}, 0.22) !important;
      box-shadow: none !important;
    }
    .m3-selected-indicator {
      background-color: ${fullHex} !important;
    }
    .m3-primary-pill {
      background-color: ${fullHex} !important;
      color: #ffffff !important;
    }
    .m3-primary-badge {
      background-color: rgba(${r}, ${g}, ${b}, 0.18) !important;
      color: ${hexLighter} !important;
    }
    .m3-primary-text {
      color: ${hexLighter} !important;
    }
    .m3-primary-bg-subtle {
      background-color: rgba(${r}, ${g}, ${b}, 0.12) !important;
    }
    .m3-primary-surface {
      background-color: rgba(${r}, ${g}, ${b}, 0.2) !important;
    }
  `;
}

/**
 * Applies the secondary/actions accent color across the application (Actions mode, Shift+Enter, clone dialogs).
 */
export function applyActionsColor(hexColor?: string) {
  const hex = (hexColor || '#a855f7').trim();
  const validHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : '#a855f7';

  let fullHex = validHex;
  if (fullHex.length === 4) {
    fullHex = '#' + fullHex[1] + fullHex[1] + fullHex[2] + fullHex[2] + fullHex[3] + fullHex[3];
  }

  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);

  // Lighter tint for text / icons on dark backgrounds
  const rLighter = Math.min(255, Math.round(r + (255 - r) * 0.25));
  const gLighter = Math.min(255, Math.round(g + (255 - g) * 0.25));
  const bLighter = Math.min(255, Math.round(b + (255 - b) * 0.25));
  const hexLighter = `#${rLighter.toString(16).padStart(2, '0')}${gLighter.toString(16).padStart(2, '0')}${bLighter.toString(16).padStart(2, '0')}`;

  // Darker shade for active / pressed buttons
  const rDarker = Math.round(r * 0.82);
  const gDarker = Math.round(g * 0.82);
  const bDarker = Math.round(b * 0.82);
  const hexDarker = `#${rDarker.toString(16).padStart(2, '0')}${gDarker.toString(16).padStart(2, '0')}${bDarker.toString(16).padStart(2, '0')}`;

  // Set standard root variables
  const root = document.documentElement;
  root.style.setProperty('--color-actions-hex', fullHex);
  root.style.setProperty('--color-actions-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--color-actions-lighter-rgb', `${rLighter}, ${gLighter}, ${bLighter}`);
  root.style.setProperty('--color-actions-500-rgb', `${r} ${g} ${b}`);
  root.style.setProperty('--color-actions-400-rgb', `${rLighter} ${gLighter} ${bLighter}`);
  root.style.setProperty('--color-actions-300-rgb', `${rLighter} ${gLighter} ${bLighter}`);
  root.style.setProperty('--color-actions-600-rgb', `${rDarker} ${gDarker} ${bDarker}`);

  // Create or update dedicated dynamic stylesheet for actions
  let styleEl = document.getElementById('iadonkey-dynamic-actions-theme') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'iadonkey-dynamic-actions-theme';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    /* Actions buttons & cards with opacity */
    .bg-purple-600,
    .bg-purple-500 {
      background-color: ${fullHex} !important;
    }
    .bg-purple-600\\/70,
    .bg-purple-500\\/70 {
      background-color: rgba(${r}, ${g}, ${b}, 0.7) !important;
    }
    .hover\\:bg-purple-600\\/85:hover,
    .hover\\:bg-purple-500\\/85:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }
    .bg-purple-600\\/85,
    .bg-purple-500\\/85 {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }
    .hover\\:bg-purple-500:hover,
    .hover\\:bg-purple-600:hover {
      background-color: ${hexLighter} !important;
    }
    .active\\:bg-purple-700:active {
      background-color: ${hexDarker} !important;
    }

    /* MagicPlan Timeline service task (clean flat solid color) */
    .timeline-task-service {
      background-color: rgba(${r}, ${g}, ${b}, 0.70) !important;
    }
    .timeline-task-service:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.85) !important;
    }

    /* Actions texts & icons */
    .text-purple-500 {
      color: ${fullHex} !important;
    }
    .text-purple-400,
    .text-purple-300,
    .text-purple-200,
    .text-purple-300\\/90,
    .text-purple-300\\/80,
    .text-purple-400\\/90 {
      color: ${hexLighter} !important;
    }
    .text-purple-300\\/85 {
      color: rgba(${rLighter}, ${gLighter}, ${bLighter}, 0.85) !important;
    }

    /* Borders */
    .border-purple-500,
    .border-purple-400 {
      border-color: ${fullHex} !important;
    }
    .focus\\:border-purple-500:focus,
    .focus\\:border-purple-500\\/60:focus {
      border-color: ${fullHex} !important;
    }

    /* Form controls */
    input.text-purple-500,
    .text-purple-500 {
      color: ${fullHex} !important;
    }

    /* Selected actions row */
    .bg-purple-600\\/30 {
      background-color: rgba(${r}, ${g}, ${b}, 0.28) !important;
    }
    .border-purple-500\\/50,
    .border-purple-500\\/40 {
      border-color: rgba(${r}, ${g}, ${b}, 0.5) !important;
    }

    /* Actions chips, badges & subtle containers */
    .bg-purple-500\\/10,
    .bg-purple-600\\/10 {
      background-color: rgba(${r}, ${g}, ${b}, 0.1) !important;
    }
    .bg-purple-500\\/15 {
      background-color: rgba(${r}, ${g}, ${b}, 0.15) !important;
    }
    .bg-purple-500\\/20,
    .bg-purple-600\\/20 {
      background-color: rgba(${r}, ${g}, ${b}, 0.2) !important;
    }
    .hover\\:bg-purple-500\\/30:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.3) !important;
    }
    .border-purple-500\\/30,
    .border-purple-500\\/25,
    .border-purple-500\\/20 {
      border-color: rgba(${r}, ${g}, ${b}, 0.35) !important;
    }

    /* Actions Navigation banner */
    .bg-purple-950\\/40 {
      background-color: rgba(${r}, ${g}, ${b}, 0.18) !important;
    }
    .hover\\:bg-purple-900\\/40:hover {
      background-color: rgba(${r}, ${g}, ${b}, 0.28) !important;
    }

    /* Shadows */
    .shadow-purple-900\\/30 {
      --tw-shadow-color: rgba(${r}, ${g}, ${b}, 0.35) !important;
    }

    /* Material 3 Actions tokens */
    .m3-actions-selected-card {
      background-color: rgba(${r}, ${g}, ${b}, 0.22) !important;
      box-shadow: none !important;
    }
    .m3-actions-indicator {
      background-color: ${fullHex} !important;
    }
    .m3-actions-pill {
      background-color: ${fullHex} !important;
      color: #ffffff !important;
    }
    .m3-actions-badge {
      background-color: rgba(${r}, ${g}, ${b}, 0.18) !important;
      color: ${hexLighter} !important;
    }
    .m3-actions-text {
      color: ${hexLighter} !important;
    }
  `;
}

