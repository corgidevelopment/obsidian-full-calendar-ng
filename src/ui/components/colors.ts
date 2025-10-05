/**
 * @file colors.ts
 * @brief Provides a predefined color palette and a utility for selecting the next available color.
 *
 * @description
 * This file contains a curated list of colors that work well in both light and
 * dark themes. The `getNextColor` utility prevents color collisions by selecting
 * the next color in the palette that is not currently in use.
 *
 * @license See LICENSE.md
 */

// A curated palette of vibrant, theme-friendly colors.
// Sourced from standard palettes like Tailwind, Radix, etc.
const COLOR_PALETTE: readonly string[] = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#ef4444', // red-500
  '#eab308', // yellow-500
  '#8b5cf6', // violet-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#0ea5e9', // sky-500
  '#d946ef', // fuchsia-500
  '#f43f5e', // rose-500
  '#10b981', // emerald-500
  '#a855f7' // purple-500
];

/**
 * Gets the next available color from the palette that is not in the provided list of used colors.
 * It prioritizes unused colors, then finds the least used color to cycle.
 * @param usedColors - An array of hex color strings currently in use.
 * @returns The next recommended hex color string.
 */
export function getNextColor(usedColors: string[]): string {
  // 1. Find the first color in our palette that isn't being used at all.
  const firstUnused = COLOR_PALETTE.find(paletteColor => !usedColors.includes(paletteColor));
  if (firstUnused) {
    return firstUnused;
  }

  // 2. If all palette colors are used at least once, find the one that's used the LEAST.
  // This prevents always defaulting to the first color in the list.
  const counts = new Map<string, number>();
  for (const color of usedColors) {
    counts.set(color, (counts.get(color) || 0) + 1);
  }

  let minCount = Infinity;
  let leastUsedColor = COLOR_PALETTE[0]; // Default to the first color

  for (const paletteColor of COLOR_PALETTE) {
    const count = counts.get(paletteColor) || 0;
    if (count < minCount) {
      minCount = count;
      leastUsedColor = paletteColor;
    }
  }

  return leastUsedColor;
}
