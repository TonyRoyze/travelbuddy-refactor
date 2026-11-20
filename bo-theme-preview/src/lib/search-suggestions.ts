import { categories, destinations, experiences } from './catalog';

export type SearchSuggestion = {
  value: string;
  kind: 'destination' | 'country' | 'category' | 'package';
};

export function localSearchSuggestions(query: string): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [
    ...Array.from(new Set([...experiences.map(item => item.destination), ...destinations.map(item => item.name)])).map(value => ({ value, kind: 'destination' as const })),
    ...Array.from(new Set(experiences.map(item => item.country))).map(value => ({ value, kind: 'country' as const })),
    ...categories.map(value => ({ value, kind: 'category' as const })),
    ...experiences.map(item => ({ value: item.title, kind: 'package' as const })),
  ];
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length < 2) return [];
  const kindOrder = { destination: 0, country: 1, category: 2, package: 3 };
  return suggestions
    .filter(item => item.value.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => Number(!a.value.toLocaleLowerCase().startsWith(normalized)) - Number(!b.value.toLocaleLowerCase().startsWith(normalized)) || kindOrder[a.kind] - kindOrder[b.kind] || a.value.localeCompare(b.value))
    .slice(0, 8);
}
