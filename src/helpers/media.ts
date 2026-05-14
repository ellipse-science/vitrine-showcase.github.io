export const MEDIA_MAP: Record<string, string> = {
  LED: 'Le Devoir',
  LAP: 'La Presse',
  RCI: 'Radio-Canada',
  TVA: 'TVA Nouvelles',
  JDM: 'Journal de Montréal',
  MG: 'Montreal Gazette',
};

export const getMediaName = (id: string): string => MEDIA_MAP[id] || id;
