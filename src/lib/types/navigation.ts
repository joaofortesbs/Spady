export const SECTIONS = ['flows', 'visoes', 'listas', 'painel', 'equipes'] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}
