export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";

export const SKIN_MAP: Record<string, string> = {
  default: "Penguin_Classic",
  icy: "Penguin_Blue",
  lava: "Penguin_Red",
  forest: "Penguin_Green",
  neon: "Penguin_Yellow",
  shadow: "Penguin_Purple",
};

export const EXTRA_SKINS: Record<string, string> = {
  pink: "Penguin_Pink",
  shark: "Penguin_Shark",
  tuxedo: "Penguin_Tuxedo",
  goldking: "Penguin_GoldKing",
};

export const ALL_SKINS = { ...SKIN_MAP, ...EXTRA_SKINS };

export const ENVIRONMENT_MAP: Record<string, string> = {
  frozen_lake: "Environment_Arctic",
  tundra_ring: "Environment_Arctic",
  glacier_pass: "Environment_Rainy",
  volcano_rim: "Environment_Desert",
  neon_arena: "Environment_Dystopian",
};

export function skinToGlb(skin: string): string {
  return `/assets/${ALL_SKINS[skin] || SKIN_MAP.default}.glb`;
}

export function mapToEnvironmentGlb(mapType: string): string {
  return `/assets/${ENVIRONMENT_MAP[mapType] || "Environment_Beach"}.glb`;
}
