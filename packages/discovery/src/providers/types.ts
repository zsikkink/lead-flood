export type DiscoveryCountryCode = 'JO' | 'SA' | 'AE' | 'EG';
export type DiscoveryLanguageCode = 'en' | 'ar';
export type SearchTaskType = 'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL';
export type SearchRefreshBucket = 'daily' | 'weekly';

export interface SerpApiCommonRequest {
  query: string;
  countryCode: DiscoveryCountryCode;
  language: DiscoveryLanguageCode;
  city?: string | null;
  page: number;
}

export interface NormalizedSearchResult {
  id: string;
  title: string | null;
  url: string;
  snippet: string | null;
  displayedLink: string | null;
  position: number | null;
  raw: unknown;
}

export interface NormalizedLocalBusiness {
  id: string;
  name: string;
  url: string | null;
  websiteUrl: string | null;
  address: string | null;
  phone: string | null;
  city: string | null;
  countryCode: DiscoveryCountryCode;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  instagramHandle: string | null;
  raw: unknown;
}

export interface NormalizedProviderResponse {
  engine: 'google' | 'google_local' | 'google_maps';
  organicResults: NormalizedSearchResult[];
  localBusinesses: NormalizedLocalBusiness[];
  raw: unknown;
}

export interface DiscoveryProvider {
  searchGoogle(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse>;
  searchGoogleLocal(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse>;
  searchMapsLocal(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse>;
}
