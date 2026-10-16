export type DiscoveryType = 'experiences' | 'guides' | 'buddies';
export type CommunityItem = {
  id: string;
  type: Exclude<DiscoveryType, 'experiences'>;
  title: string;
  destination: string;
  country: string;
  subtitle: string;
  description: string;
  position: [number, number];
  image: string;
  age?: number;
  gender?: 'Woman' | 'Man' | 'Non-binary';
  interests?: string[];
  pace?: 'Relaxed' | 'Active';
  guideFocus?: 'Food & culture' | 'History & heritage' | 'Wildlife & nature';
  languages?: string[];
  guideStyle?: 'Easygoing' | 'Active';
};

export const communityItems: CommunityItem[] = [
  {
    id: 'guide-colombo', type: 'guides', title: 'Nadeesha', destination: 'Colombo', country: 'Sri Lanka',
    subtitle: 'Food & local culture', description: 'Enjoys sharing neighborhood food stories and city walks.', position: [6.941, 79.865],
    image: '/profiles/nadeesha.jpg',
    guideFocus: 'Food & culture', languages: ['English', 'Sinhala'], guideStyle: 'Easygoing',
  },
  {
    id: 'guide-sigiriya', type: 'guides', title: 'Ruwan', destination: 'Sigiriya', country: 'Sri Lanka',
    subtitle: 'Heritage & nature', description: 'Interested in ancient sites, village life, and quieter trails.', position: [7.967, 80.773],
    image: '/profiles/ruwan.jpg',
    guideFocus: 'History & heritage', languages: ['English', 'Sinhala'], guideStyle: 'Active',
  },
  {
    id: 'guide-yala', type: 'guides', title: 'Samira', destination: 'Yala', country: 'Sri Lanka',
    subtitle: 'Wildlife & photography', description: 'Loves helping travelers notice the smaller details of the park.', position: [6.288, 81.405],
    image: '/profiles/samira.jpg',
    guideFocus: 'Wildlife & nature', languages: ['English', 'Tamil'], guideStyle: 'Active',
  },
  {
    id: 'buddy-colombo', type: 'buddies', title: 'Maya', destination: 'Colombo', country: 'Sri Lanka',
    subtitle: 'Food markets & city walks', description: 'Interested in trying local food and exploring on foot.', position: [6.928, 79.872],
    image: '/profiles/maya.jpg',
    age: 27, gender: 'Woman', interests: ['Food', 'Walking'], pace: 'Relaxed',
  },
  {
    id: 'buddy-sigiriya', type: 'buddies', title: 'Alex', destination: 'Sigiriya', country: 'Sri Lanka',
    subtitle: 'Sunrise hikes', description: 'Interested in an early start and scenic walks.', position: [7.949, 80.779],
    image: '/profiles/alex.jpg',
    age: 32, gender: 'Non-binary', interests: ['Hiking', 'Photography'], pace: 'Active',
  },
  {
    id: 'buddy-yala', type: 'buddies', title: 'Leah', destination: 'Yala', country: 'Sri Lanka',
    subtitle: 'Wildlife & nature', description: 'Interested in nature, photography, and relaxed outings.', position: [6.268, 81.408],
    image: '/profiles/leah.jpg',
    age: 29, gender: 'Woman', interests: ['Wildlife', 'Photography'], pace: 'Relaxed',
  },
  {
    id: 'buddy-kandy', type: 'buddies', title: 'Ravi', destination: 'Kandy', country: 'Sri Lanka',
    subtitle: 'Culture & walking', description: 'Interested in local history and easy city walks.', position: [7.291, 80.637],
    image: '/profiles/ravi.jpg',
    age: 35, gender: 'Man', interests: ['Culture', 'Walking'], pace: 'Relaxed',
  },
];

export function communityMatches(item: CommunityItem, query: string) {
  return `${item.title} ${item.destination} ${item.country} ${item.subtitle} ${item.guideFocus ?? ''} ${(item.languages ?? []).join(' ')} ${(item.interests ?? []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
}
