import type { AvatarTone } from "~/features/messaging/types";

const TONES: AvatarTone[] = ["green", "yellow", "red", "clay", "river"];

export const avatarToneClass: Record<AvatarTone, string> = {
  green: "bg-tone-green text-tone-green-ink",
  yellow: "bg-tone-yellow text-tone-yellow-ink",
  red: "bg-tone-red text-tone-red-ink",
  clay: "bg-tone-clay text-tone-clay-ink",
  river: "bg-tone-river text-tone-river-ink",
};

export const authorToneClass: Record<AvatarTone, string> = {
  green: "text-tone-green-ink",
  yellow: "text-tone-yellow-ink",
  red: "text-tone-red-ink",
  clay: "text-tone-clay-ink",
  river: "text-tone-river-ink",
};

export function toneFor(seed: string): AvatarTone {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return TONES[hash % TONES.length];
}

export function initials(name: string): string {
  const parts = name
    .replace(/[’']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;

  return letters.toLocaleUpperCase("fr");
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();
}
