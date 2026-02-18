import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();
const demoUserPassword = process.env.DEMO_USER_PASSWORD ?? 'demo-password';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });

  return ['scrypt', '16384', '8', '1', salt, derived.toString('base64url')].join('$');
}

// All MENA countries as default target
const MENA_COUNTRIES = [
  'UAE', 'KSA', 'Egypt', 'Jordan', 'Bahrain', 'Kuwait', 'Oman', 'Qatar',
  'Lebanon', 'Iraq', 'Morocco', 'Tunisia', 'Algeria', 'Libya', 'Yemen',
  'Syria', 'Palestine', 'Sudan',
];

// ── 8 ICP Segments from Zbooni Sales Onboarding Deck ──────────
const ICP_SEGMENTS = [
  {
    name: 'Luxury & High-Ticket Services',
    description: 'Yacht charters, exotic car rentals, private aviation, luxury travel designers, personal shoppers serving HNWIs',
    targetIndustries: ['Luxury Services', 'Yacht Charter', 'Private Aviation', 'Luxury Travel', 'Personal Shopping'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 5,
    maxCompanySize: 200,
    featureList: ['Large one-off payments (up to AED 1M per link)', 'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal)', 'Multi-MID support for failed transaction retries', 'Immediate live support via call or WhatsApp', 'Catalog (CShop) to pre-list services', 'CRM to track customer order history'],
    metadataJson: { priority: 'P1', avgTicket: 'Very High (AED 5,000–100,000)', volumePotential: 'Medium', salesCycle: 'Short', opsComplexity: 'Medium', revenuePotential: 'Very High', hook: 'Most of our customers use WhatsApp to close high-value deals but struggle when payments fail or clients are international.', angle: ['One payment link up to AED 1M', 'Multi-MID retries if a transaction fails', 'Live support when timing matters'] },
  },
  {
    name: 'Gifting, Corporate & Bespoke Experiences',
    description: 'Premium corporate gifting houses, curated gift box brands, high-end florists, experience gifting platforms',
    targetIndustries: ['Corporate Gifting', 'Florists', 'Gift Boxes', 'Experience Platforms', 'Bespoke Events'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 5,
    maxCompanySize: 300,
    featureList: ['Catalog (CShop) for pre-listing services', 'Live payment link editing', 'In-app discount creation', 'Promo code management', 'WhatsApp marketing campaigns via Zbooni verified number', 'Multiple payment methods'],
    metadataJson: { priority: 'P1', avgTicket: 'Medium–High', volumePotential: 'High (seasonal)', salesCycle: 'Short–Medium', opsComplexity: 'Medium', revenuePotential: 'High', hook: 'We work with brands handling seasonal spikes, bulk orders, and multiple agents selling at once.', angle: ['Catalog + payment links inside WhatsApp', 'Promo codes & campaigns for peak periods', 'Centralized tracking across agents'] },
  },
  {
    name: 'Events, Weddings & Experiential Operators',
    description: 'Wedding planners, event production agencies, exhibition organizers, pop-up markets, festival operators',
    targetIndustries: ['Wedding Planning', 'Event Production', 'Exhibitions', 'Pop-up Markets', 'Festivals'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 3,
    maxCompanySize: 500,
    featureList: ['End-to-end event marketing via WhatsApp', 'Ticketing solution', 'Catalog (CShop) for products/services', 'QR-based food ordering and payment', 'POS machine for in-person cards', 'Customer database for re-engagement', 'Master organizer dashboard', 'Promo codes'],
    metadataJson: { priority: 'P1', avgTicket: 'High', volumePotential: 'High (event-based)', salesCycle: 'Medium', opsComplexity: 'High', revenuePotential: 'Very High', hook: 'Events fail when payments are delayed or fragmented — especially with multiple vendors and stakeholders.', angle: ['Ticketing, QR payments, food ordering', 'Master dashboard for organizers', 'WhatsApp marketing + re-engagement'] },
  },
  {
    name: 'Home, Design & High-Value Contracting',
    description: 'Interior design studios, renovation & fit-out firms, architecture companies, premium maintenance groups',
    targetIndustries: ['Interior Design', 'Renovation', 'Architecture', 'Contracting', 'Landscape Design'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 5,
    maxCompanySize: 500,
    featureList: ['Large one-off payments (up to AED 1M)', 'Customizable milestone-based payment links', 'Easy reconciliation with VAT tracking', 'Customizable instant receipts', 'Catalog (CShop)', 'CRM with order history and notes', 'In-app discount creation'],
    metadataJson: { priority: 'P1', avgTicket: 'High', volumePotential: 'Medium', salesCycle: 'Medium–Long', opsComplexity: 'Medium', revenuePotential: 'High', hook: 'We help firms replace bank transfers with clean, staged card payments.', angle: ['Milestone-based payment links', 'Easy reconciliation & VAT tracking', 'Partial payments + receipts'] },
  },
  {
    name: 'Boutique Hospitality & Short-Stay Operators',
    description: 'Boutique hotels, holiday home operators, serviced residences, property management with concierge/add-on services',
    targetIndustries: ['Boutique Hotels', 'Holiday Homes', 'Serviced Residences', 'Property Management', 'Hospitality'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 3,
    maxCompanySize: 200,
    featureList: ['Large one-off payments (up to AED 1M)', 'Partial payments (deposit/balance/add-ons)', 'International card acceptance', 'Multiple payment methods', 'Instant receipts', 'Easy reconciliation with VAT', 'Catalog for upsells via chat/QR', 'CRM for guest history'],
    metadataJson: { priority: 'P1', avgTicket: 'Medium–High', volumePotential: 'High', salesCycle: 'Short', opsComplexity: 'Medium', revenuePotential: 'High', hook: 'Guests want to pay instantly, remotely, and securely before arrival.', angle: ['Deposits, balances, and upsells via WhatsApp', 'Multi-currency + international cards', 'Guest CRM & reconciliation'] },
  },
  {
    name: 'Premium Wellness & Longevity Clinics',
    description: 'Premium wellness clinics, aesthetic treatment centres, longevity/IV therapy clinics, advanced diagnostics',
    targetIndustries: ['Wellness Clinics', 'Aesthetic Medicine', 'Longevity', 'IV Therapy', 'Medical Tourism'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 5,
    maxCompanySize: 100,
    featureList: ['Staged or package-based payment links', 'Multiple payment methods (incl. Tabby, Tamara)', 'CRM for patient history and notes', 'Promo codes for campaigns/referrals', 'WhatsApp marketing campaigns', 'Instant receipts', 'International card acceptance'],
    metadataJson: { priority: 'P2', avgTicket: 'High', volumePotential: 'Medium', salesCycle: 'Medium', opsComplexity: 'High (compliance)', revenuePotential: 'Medium–High', hook: 'Clinics lose time when payments fail or confirmations aren\'t instant.', angle: ['High-ticket package payments', 'Multi-MID retry logic', 'Human support for urgent cases'] },
  },
  {
    name: 'High-Ticket Coaching & Advisory',
    description: 'Executive coaches, business advisory firms, paid communities, masterminds, and membership programs',
    targetIndustries: ['Executive Coaching', 'Business Advisory', 'Masterminds', 'Memberships', 'Consulting'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 1,
    maxCompanySize: 50,
    featureList: ['Partial or staged payment links', 'International card acceptance', 'Multiple payment methods (incl. Tabby, Tamara)', 'Instant receipts', 'CRM for client history and enrolment', 'Promo codes for cohorts/referrals', 'WhatsApp marketing for re-engagement'],
    metadataJson: { priority: 'P2', avgTicket: 'Medium–High', volumePotential: 'Medium', salesCycle: 'Short', opsComplexity: 'Low', revenuePotential: 'Medium', hook: 'High-ticket programs close in conversations, not on websites.', angle: ['Staged payments & cohorts', 'CRM + re-engagement campaigns', 'Simple reconciliation'] },
  },
  {
    name: 'Education & Training Providers',
    description: 'Private education institutes, professional training centres, bootcamps, certifications, cohort-based programs',
    targetIndustries: ['Private Education', 'Professional Training', 'Bootcamps', 'Certifications', 'Cohort Programs'],
    targetCountries: MENA_COUNTRIES,
    minCompanySize: 5,
    maxCompanySize: 300,
    featureList: ['Multiple payment methods (incl. Tabby, Tamara)', 'Inventory limits for attendance', 'Instant receipts', 'Reconciliation with student/VAT tracking', 'CRM for student enrolment and notes', 'Promo codes for early-bird/partner discounts', 'WhatsApp campaigns for new cohorts'],
    metadataJson: { priority: 'P2', avgTicket: 'Medium', volumePotential: 'High (cohorts)', salesCycle: 'Medium', opsComplexity: 'Medium', revenuePotential: 'Medium', hook: 'Managing deposits, cohorts, and tracking payments shouldn\'t be manual.', angle: ['Seat-based payments', 'Promo codes & intakes', 'Student tracking + reconciliation'] },
  },
];

// ── Leads matched to ICP segments ──────────────────────────────
const FAKE_LEADS = [
  // A: Luxury & High-Ticket Services
  { firstName: 'Ahmed', lastName: 'Al Mansoori', email: 'ahmed@oceancharters.ae', phone: '+971501234567', source: 'apollo', status: 'replied' as const, icpIndex: 0, enrichmentData: { companyName: 'Ocean Charter Dubai', industry: 'Yacht Charter', country: 'UAE', city: 'Dubai', employeeCount: 35, domain: 'oceancharters.ae', linkedinUrl: 'https://linkedin.com/in/ahmedmansoori', title: 'Managing Director', phone: '+971501234567', avgDealSize: 'AED 45,000', whatsappUsage: 'Primary sales channel', _scoreInfo: { blendedScore: 0.92, scoreBand: 'HIGH', reasoning: ['Industry perfect fit: Yacht Charter (luxury high-ticket)', 'High avg deal size (AED 45K) matches payment complexity criteria', 'WhatsApp-led sales motion confirms sales fit', 'UAE location in core market', 'Decision maker role (Managing Director)'] } } },
  { firstName: 'Diana', lastName: 'Rostova', email: 'diana@elitecars.ae', phone: '+971502345678', source: 'linkedin_scrape', status: 'messaged' as const, icpIndex: 0, enrichmentData: { companyName: 'Elite Cars Rental', industry: 'Luxury Car Rental', country: 'UAE', city: 'Dubai', employeeCount: 22, domain: 'elitecars.ae', linkedinUrl: 'https://linkedin.com/in/dianarostova', title: 'Operations Director', phone: '+971502345678', avgDealSize: 'AED 15,000', _scoreInfo: { blendedScore: 0.85, scoreBand: 'HIGH', reasoning: ['Luxury car rental is high-ticket service segment', 'International client mix likely (Dubai tourism)', 'Company size fits target range', 'Decision maker role'] } } },

  // B: Gifting, Corporate & Bespoke
  { firstName: 'Sara', lastName: 'Al Hashemi', email: 'sara@blossomgifts.ae', phone: '+971503456789', source: 'google_search', status: 'enriched' as const, icpIndex: 1, enrichmentData: { companyName: 'Blossom Premium Gifting', industry: 'Corporate Gifting', country: 'UAE', city: 'Abu Dhabi', employeeCount: 18, domain: 'blossomgifts.ae', linkedinUrl: 'https://linkedin.com/in/sarahashemi', title: 'Founder & CEO', phone: '+971503456789', whatsappUsage: 'Bulk orders via WhatsApp', seasonalPeaks: 'Ramadan, National Day, Corporate Year-End', _scoreInfo: { blendedScore: 0.88, scoreBand: 'HIGH', reasoning: ['Corporate gifting with seasonal volume spikes', 'WhatsApp-driven bulk orders confirm sales motion fit', 'Founder-led = fast decision maker', 'Multiple agents likely handling sales'] } } },

  // C: Events, Weddings & Experiential
  { firstName: 'Fatima', lastName: 'Al Zahrani', email: 'fatima@dreamweddings.ae', phone: '+971504567890', source: 'apollo', status: 'messaged' as const, icpIndex: 2, enrichmentData: { companyName: 'Dream Weddings Dubai', industry: 'Wedding Planning', country: 'UAE', city: 'Dubai', employeeCount: 12, domain: 'dreamweddings.ae', linkedinUrl: 'https://linkedin.com/in/fatimazahrani', title: 'Creative Director', phone: '+971504567890', avgDealSize: 'AED 80,000', whatsappUsage: 'Client coordination + payments', _scoreInfo: { blendedScore: 0.91, scoreBand: 'HIGH', reasoning: ['Wedding planning = very high ticket, deposit-heavy', 'Multiple stakeholders paying from different locations', 'Time-sensitive payments (zero tolerance for delays)', 'WhatsApp-led client coordination confirms sales fit', 'Revenue attribution by event needed'] } } },
  { firstName: 'Omar', lastName: 'Khalifa', email: 'omar@popupsouk.ae', phone: '+971505678901', source: 'google_search', status: 'enriched' as const, icpIndex: 2, enrichmentData: { companyName: 'PopUp Souk', industry: 'Pop-up Markets', country: 'UAE', city: 'Dubai', employeeCount: 8, domain: 'popupsouk.ae', title: 'Founder', phone: '+971505678901', avgDealSize: 'AED 5,000 per vendor', _scoreInfo: { blendedScore: 0.72, scoreBand: 'MEDIUM', reasoning: ['Pop-up market operator fits events segment', 'Multiple vendors = good fit for master dashboard', 'Smaller ticket size per transaction', 'Seasonal/event-based volume'] } } },

  // D: Home, Design & Contracting
  { firstName: 'Khalid', lastName: 'Al Dosari', email: 'khalid@alhabdesign.sa', phone: '+966552345678', source: 'apollo', status: 'enriched' as const, icpIndex: 3, enrichmentData: { companyName: 'Al Hab Interior Design', industry: 'Interior Design', country: 'KSA', city: 'Riyadh', employeeCount: 45, domain: 'alhabdesign.sa', linkedinUrl: 'https://linkedin.com/in/khaliddosari', title: 'Business Development Manager', phone: '+966552345678', avgDealSize: 'AED 120,000', paymentMethod: 'Bank transfers (current)', _scoreInfo: { blendedScore: 0.87, scoreBand: 'HIGH', reasoning: ['Interior design = milestone-based payments', 'Currently on bank transfers (high pain, switching ready)', 'KSA market is core geography', 'High average deal size fits payment complexity', 'Poor reconciliation with bank transfers is a pain point'] } } },

  // E: Boutique Hospitality
  { firstName: 'Noura', lastName: 'Al Suwaidi', email: 'noura@palmvillas.ae', phone: '+971506789012', source: 'linkedin_scrape', status: 'messaged' as const, icpIndex: 4, enrichmentData: { companyName: 'Palm Villas Collection', industry: 'Holiday Homes', country: 'UAE', city: 'Dubai', employeeCount: 28, domain: 'palmvillas.ae', linkedinUrl: 'https://linkedin.com/in/nourasuwaidi', title: 'Chief Commercial Officer', phone: '+971506789012', avgDealSize: 'AED 8,000 per booking', internationalGuests: '65%', _scoreInfo: { blendedScore: 0.84, scoreBand: 'HIGH', reasoning: ['Holiday homes with high-value bookings + deposits', '65% international guests = multi-currency need', 'Pre-arrival WhatsApp communication is key', 'Add-on services create upsell opportunity', 'CCO role = decision maker'] } } },

  // F: Premium Wellness
  { firstName: 'Layla', lastName: 'Nasser', email: 'layla@glowclinic.ae', phone: '+971507890123', source: 'google_search', status: 'new' as const, icpIndex: 5, enrichmentData: { companyName: 'Glow Aesthetics Clinic', industry: 'Aesthetic Medicine', country: 'UAE', city: 'Dubai', employeeCount: 15, domain: 'glowclinic.ae', title: 'Founder & Medical Director', phone: '+971507890123', avgDealSize: 'AED 12,000 per package', medicalTourism: true, _scoreInfo: { blendedScore: 0.79, scoreBand: 'HIGH', reasoning: ['Premium aesthetics clinic = high-ticket packages', 'Medical tourism clients need international payments', 'Deposit-based booking model fits well', 'Founder role = decision maker', 'P2 priority ICP but strong individual signals'] } } },

  // G: Coaching & Advisory
  { firstName: 'Mohammed', lastName: 'Khan', email: 'mohammed@scalemind.sa', phone: '+966551234567', source: 'apollo', status: 'replied' as const, icpIndex: 6, enrichmentData: { companyName: 'ScaleMind Advisory', industry: 'Business Advisory', country: 'KSA', city: 'Riyadh', employeeCount: 8, domain: 'scalemind.sa', linkedinUrl: 'https://linkedin.com/in/mohammedkhan', title: 'CEO', phone: '+966551234567', avgDealSize: 'AED 25,000 per retainer', whatsappUsage: 'Client acquisition + payment collection', _scoreInfo: { blendedScore: 0.76, scoreBand: 'HIGH', reasoning: ['High-ticket advisory retainers', 'WhatsApp-driven client acquisition', 'Milestone/staged payments needed', 'CEO = direct decision maker', 'KSA core market'] } } },

  // H: Education & Training
  { firstName: 'Hessa', lastName: 'Al Shamsi', email: 'hessa@techacademy.ae', phone: '+971508901234', source: 'apollo', status: 'processing' as const, icpIndex: 7, enrichmentData: { companyName: 'Tech Academy Dubai', industry: 'Professional Training', country: 'UAE', city: 'Dubai', employeeCount: 32, domain: 'techacademy.ae', linkedinUrl: 'https://linkedin.com/in/hessashamsi', title: 'Head of Growth', phone: '+971508901234', avgDealSize: 'AED 4,500 per course', cohortModel: true, _scoreInfo: { blendedScore: 0.68, scoreBand: 'MEDIUM', reasoning: ['Professional training with cohort model', 'Deposits required for seat reservation', 'Medium ticket size limits revenue potential', 'Growth role = influencer, not final decision maker', 'Good fit for promo codes and WhatsApp campaigns'] } } },

  // More varied leads
  { firstName: 'Rashed', lastName: 'Al Mubarak', email: 'rashed@gulfevents.ae', phone: '+971509012345', source: 'google_search', status: 'cold' as const, icpIndex: 2, enrichmentData: { companyName: 'Gulf Events Production', industry: 'Event Production', country: 'UAE', city: 'Abu Dhabi', employeeCount: 55, domain: 'gulfevents.ae', title: 'Operations Manager', phone: '+971509012345', _scoreInfo: { blendedScore: 0.45, scoreBand: 'LOW', reasoning: ['Event production company fits segment', 'Operations Manager is not decision maker', 'No clear WhatsApp sales motion signals', 'No international payment need indicated', 'Cold lead — no engagement'] } } },
  { firstName: 'Youssef', lastName: 'Habib', email: 'youssef@luxstay.ae', phone: '+971501112233', source: 'apollo', status: 'enriched' as const, icpIndex: 4, enrichmentData: { companyName: 'LuxStay Residences', industry: 'Serviced Residences', country: 'UAE', city: 'Dubai', employeeCount: 42, domain: 'luxstay.ae', linkedinUrl: 'https://linkedin.com/in/youssefhabib', title: 'Revenue Manager', phone: '+971501112233', avgDealSize: 'AED 6,500 per stay', internationalGuests: '70%', _scoreInfo: { blendedScore: 0.82, scoreBand: 'HIGH', reasoning: ['Serviced residences with high international guest ratio', 'Revenue Manager role shows commercial focus', 'High booking values with deposit model', 'WhatsApp pre-arrival communication standard'] } } },
  { firstName: 'Amira', lastName: 'Farouk', email: 'amira@artisanflowers.sa', phone: '+966553456789', source: 'linkedin_scrape', status: 'messaged' as const, icpIndex: 1, enrichmentData: { companyName: 'Artisan Flowers KSA', industry: 'Florists', country: 'KSA', city: 'Jeddah', employeeCount: 12, domain: 'artisanflowers.sa', linkedinUrl: 'https://linkedin.com/in/amirafarouk', title: 'Owner', phone: '+966553456789', avgDealSize: 'AED 3,500 per arrangement', seasonalPeaks: 'Valentines, Mothers Day, Ramadan', _scoreInfo: { blendedScore: 0.74, scoreBand: 'MEDIUM', reasoning: ['High-end florist with seasonal peaks', 'Owner = decision maker', 'Medium ticket size', 'KSA market in core geography', 'WhatsApp ordering likely but not confirmed'] } } },
];

const PITCHED_FEATURES = [
  'WhatsApp Payment Links', 'Catalog (CShop)', 'Multi-MID Retry', 'Promo Codes',
  'International Cards', 'Milestone Payments', 'WhatsApp Campaigns', 'Guest CRM',
];

async function main(): Promise<void> {
  const passwordHash = hashPassword(demoUserPassword);

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@lead-flood.local' },
    update: { firstName: 'Demo', lastName: 'User', isActive: true, passwordHash },
    create: { email: 'demo@lead-flood.local', firstName: 'Demo', lastName: 'User', isActive: true, passwordHash },
  });

  // Also upsert the real user
  await prisma.user.upsert({
    where: { email: 'peem.pibuldham@gmail.com' },
    update: {},
    create: { email: 'peem.pibuldham@gmail.com', firstName: 'Peem', lastName: 'Pibuldham', isActive: true, passwordHash },
  });

  // Delete existing ICPs and recreate from PDF
  console.log('Clearing old ICPs and creating 8 segments from PDF...');
  await prisma.qualificationRule.deleteMany({});
  await prisma.icpProfile.deleteMany({});

  const icpIds: string[] = [];
  for (const segment of ICP_SEGMENTS) {
    const icp = await prisma.icpProfile.create({
      data: {
        name: segment.name,
        description: segment.description,
        qualificationLogic: 'WEIGHTED',
        targetIndustries: segment.targetIndustries,
        targetCountries: segment.targetCountries,
        minCompanySize: segment.minCompanySize,
        maxCompanySize: segment.maxCompanySize,
        requiredTechnologies: [],
        excludedDomains: [],
        featureList: JSON.parse(JSON.stringify(segment.featureList)),
        metadataJson: JSON.parse(JSON.stringify(segment.metadataJson)),
        isActive: true,
        createdByUserId: demoUser.id,
      },
    });
    icpIds.push(icp.id);
  }

  // Seed leads
  console.log('Seeding leads...');
  for (const leadData of FAKE_LEADS) {
    const lead = await prisma.lead.upsert({
      where: { email: leadData.email },
      update: {
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        phone: leadData.phone,
        source: leadData.source,
        status: leadData.status,
        enrichmentData: JSON.parse(JSON.stringify(leadData.enrichmentData)),
      },
      create: {
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        email: leadData.email,
        phone: leadData.phone,
        source: leadData.source,
        status: leadData.status,
        enrichmentData: JSON.parse(JSON.stringify(leadData.enrichmentData)),
      },
    });

    const icpId = icpIds[leadData.icpIndex] ?? icpIds[0]!;
    const pitchedFeature = PITCHED_FEATURES[Math.floor(Math.random() * PITCHED_FEATURES.length)]!;

    // Create message drafts for messaged/replied/enriched leads
    if (leadData.status === 'messaged' || leadData.status === 'replied' || leadData.status === 'enriched') {
      const existingDraft = await prisma.messageDraft.findFirst({ where: { leadId: lead.id } });

      if (!existingDraft) {
        const approvalStatus = leadData.status === 'enriched' ? 'PENDING' as const : 'APPROVED' as const;
        const draft = await prisma.messageDraft.create({
          data: {
            leadId: lead.id,
            icpProfileId: icpId,
            promptVersion: 'v1.0',
            generatedByModel: 'gpt-4o-mini',
            approvalStatus,
            ...(approvalStatus === 'APPROVED' ? { approvedByUserId: demoUser.id, approvedAt: new Date() } : {}),
            followUpNumber: 0,
            pitchedFeature,
          },
        });

        const company = leadData.enrichmentData.companyName;
        // Alternate between WhatsApp and Email — one channel per draft
        const useWhatsApp = leadData.enrichmentData.whatsappUsage !== undefined;
        const channel = useWhatsApp ? 'WHATSAPP' as const : 'EMAIL' as const;

        const variant = await prisma.messageVariant.create({
          data: {
            messageDraftId: draft.id,
            variantKey: 'A',
            channel,
            subject: channel === 'EMAIL' ? `${leadData.firstName}, quick question about ${company}'s payment flow` : null,
            bodyText: channel === 'WHATSAPP'
              ? `Hi ${leadData.firstName}! I'm from Zbooni — we help businesses like ${company} collect payments directly through WhatsApp conversations. Would love to show you how it works. Free for a quick chat?`
              : `Hi ${leadData.firstName},\n\nI noticed ${company} is doing great work in ${leadData.enrichmentData.industry}. We help businesses like yours collect payments faster through WhatsApp — branded links, instant confirmations, and multi-currency support.\n\nWould you be open to a 15-minute call this week?\n\nBest,\nZbooni Sales Team`,
            bodyHtml: null,
            ctaText: channel === 'EMAIL' ? 'Book a Demo' : null,
            qualityScore: 0.78 + Math.random() * 0.15,
            isSelected: approvalStatus === 'APPROVED',
          },
        });

        // Create sends for approved drafts
        if (approvalStatus === 'APPROVED') {
          await prisma.messageSend.create({
            data: {
              leadId: lead.id,
              messageDraftId: draft.id,
              messageVariantId: variant.id,
              channel,
              provider: channel === 'WHATSAPP' ? 'TRENGO' : 'RESEND',
              status: leadData.status === 'replied' ? 'REPLIED' : 'SENT',
              idempotencyKey: `seed-${lead.id}-${Date.now()}`,
              sentAt: new Date(Date.now() - 86400000 * (2 + Math.floor(Math.random() * 5))),
              ...(leadData.status === 'replied' ? { repliedAt: new Date(Date.now() - 86400000) } : {}),
            },
          });
        }
      }
    }
  }

  console.log(`Seeded ${ICP_SEGMENTS.length} ICPs, ${FAKE_LEADS.length} leads, and message drafts.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
