export interface DiscoveryIcpFilters {
  industries?: string[];
  countries?: string[];
  requiredTechnologies?: string[];
  excludedDomains?: string[];
  minCompanySize?: number;
  maxCompanySize?: number;
  includeTerms?: string[];
  excludeTerms?: string[];
}
