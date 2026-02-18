import type { DiscoverySeedProfile } from '../config.js';
import type { DiscoveryCountryCode, DiscoveryLanguageCode } from '../providers/types.js';

export const initialCitiesByCountry: Record<DiscoveryCountryCode, string[]> = {
  JO: ['Amman', 'Irbid', 'Zarqa', 'Aqaba'],
  SA: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca'],
  AE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'],
  EG: ['Cairo', 'Alexandria', 'Giza', 'Mansoura'],
};

export const smallInitialCitiesByCountry: Record<DiscoveryCountryCode, string[]> = {
  JO: ['Amman'],
  SA: ['Riyadh', 'Jeddah'],
  AE: ['Dubai', 'Abu Dhabi'],
  EG: ['Cairo'],
};

export const categoryTaxonomyEN: string[] = [
  'bakery',
  'coffee shop',
  'restaurant',
  'beauty salon',
  'barbershop',
  'gym',
  'dental clinic',
  'medical clinic',
  'fashion boutique',
  'grocery store',
  'electronics store',
  'bookstore',
  'home decor',
  'flower shop',
  'cleaning service',
  'moving service',
  'car repair',
  'auto accessories',
  'pet shop',
  'event planner',
  'catering service',
  'furniture store',
  'kids clothing',
  'optical store',
];

export const smallCategoryTaxonomyEN: string[] = [
  'bakery',
  'coffee shop',
  'restaurant',
  'beauty salon',
  'barbershop',
  'gym',
  'dental clinic',
  'fashion boutique',
];

export const categoryTaxonomyAR: string[] = [
  'مخبز',
  'مقهى',
  'مطعم',
  'صالون تجميل',
  'حلاق',
  'نادي رياضي',
  'عيادة أسنان',
  'عيادة طبية',
  'بوتيك أزياء',
  'بقالة',
  'متجر إلكترونيات',
  'مكتبة',
  'ديكور منزلي',
  'محل ورد',
  'خدمات تنظيف',
  'خدمات نقل',
  'صيانة سيارات',
  'إكسسوارات سيارات',
  'متجر حيوانات',
  'منظم فعاليات',
  'خدمات ضيافة',
  'متجر أثاث',
  'ملابس أطفال',
  'محل نظارات',
];

export const smallCategoryTaxonomyAR: string[] = [
  'مخبز',
  'مقهى',
  'مطعم',
  'صالون تجميل',
  'حلاق',
  'نادي رياضي',
  'عيادة أسنان',
  'بوتيك أزياء',
];

export const queryTemplatesEN: string[] = [
  '{category} in {city} {country} contact us WhatsApp',
  '{category} in {city} {country} DM for orders Instagram',
  '{category} in {city} {country} order now send payment link',
];

export const smallQueryTemplatesEN: string[] = [
  '{category} in {city} {country} contact us WhatsApp',
];

export const queryTemplatesAR: string[] = [
  '{category} في {city} {country} تواصل معنا واتساب',
  '{category} في {city} {country} اطلب عبر انستقرام',
  '{category} في {city} {country} اطلب الآن رابط دفع',
];

export const smallQueryTemplatesAR: string[] = [
  '{category} في {city} {country} تواصل معنا واتساب',
];

export function getInitialCitiesByCountry(
  profile: DiscoverySeedProfile,
): Record<DiscoveryCountryCode, string[]> {
  return profile === 'small' ? smallInitialCitiesByCountry : initialCitiesByCountry;
}

export function getCategoryTaxonomy(
  language: DiscoveryLanguageCode,
  profile: DiscoverySeedProfile = 'default',
): string[] {
  if (profile === 'small') {
    return language === 'ar' ? smallCategoryTaxonomyAR : smallCategoryTaxonomyEN;
  }
  return language === 'ar' ? categoryTaxonomyAR : categoryTaxonomyEN;
}

export function getQueryTemplates(
  language: DiscoveryLanguageCode,
  profile: DiscoverySeedProfile = 'default',
): string[] {
  if (profile === 'small') {
    return language === 'ar' ? smallQueryTemplatesAR : smallQueryTemplatesEN;
  }
  return language === 'ar' ? queryTemplatesAR : queryTemplatesEN;
}
