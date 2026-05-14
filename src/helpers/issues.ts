export interface IssueMeta {
  key: string;
  color: string;
  label: string;
  title: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ISSUE_META: IssueMeta[] = [
  { key: 'economy_and_labour',                        color: '#742630', label: 'Économie',   title: 'Économie et travail' },
  { key: 'governments_and_governance',                color: '#6F5828', label: 'Gouv.',       title: 'Gouvernements et gouvernance' },
  { key: 'health_and_social_services',                color: '#7D5358', label: 'Santé',       title: 'Santé et services sociaux' },
  { key: 'environment_and_energy',                    color: '#5F6E36', label: 'Environ.',    title: 'Environnement et énergie' },
  { key: 'rights_liberties_minorities_discrimination',color: '#5F4E78', label: 'Droits',      title: 'Droits, libertés, minorités' },
  { key: 'culture_and_nationalism',                   color: '#35604E', label: 'Culture',     title: 'Culture et nationalisme' },
  { key: 'education',                                 color: '#7A5A23', label: 'Éduc.',       title: 'Éducation' },
  { key: 'international_affairs_and_defense',         color: '#304860', label: 'Aff. int.',   title: 'Affaires internationales' },
  { key: 'law_and_crime',                             color: '#463E3E', label: 'Loi',         title: 'Loi et crime' },
  { key: 'public_lands_and_agriculture',              color: '#7D5132', label: 'Terres',      title: 'Terres publiques, agri.' },
  { key: 'immigration',                               color: '#8B6914', label: 'Immig.',      title: 'Immigration' },
  { key: 'technology',                                color: '#3A5F70', label: 'Tech.',       title: 'Technologie' },
];

export const getIssueMeta = (key: string | null): IssueMeta | undefined => {
  if (!key) return undefined;
  return ISSUE_META.find(m => m.key === key);
};
