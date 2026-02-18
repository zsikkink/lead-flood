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

const FAKE_LEADS = [
  { firstName: 'Ahmed', lastName: 'Al Mansoori', email: 'ahmed.mansoori@goldenestate.ae', phone: '+971501234567', source: 'apollo', status: 'enriched' as const, enrichmentData: { companyName: 'Golden Estate Real Estate', industry: 'Real Estate', country: 'UAE', city: 'Dubai', employeeCount: 85, domain: 'goldenestate.ae', linkedinUrl: 'https://linkedin.com/in/ahmedmansoori', title: 'Chief Operating Officer', phone: '+971501234567' } },
  { firstName: 'Sara', lastName: 'Al Hashemi', email: 'sara@luxeretail.com', phone: '+971502345678', source: 'google_search', status: 'messaged' as const, enrichmentData: { companyName: 'Luxe Retail Group', industry: 'Retail', country: 'UAE', city: 'Abu Dhabi', employeeCount: 240, domain: 'luxeretail.com', linkedinUrl: 'https://linkedin.com/in/sarahashemi', title: 'VP of Digital Commerce', phone: '+971502345678' } },
  { firstName: 'Mohammed', lastName: 'Khan', email: 'mkhan@finpay.sa', phone: '+966551234567', source: 'apollo', status: 'replied' as const, enrichmentData: { companyName: 'FinPay Solutions', industry: 'Financial Services', country: 'KSA', city: 'Riyadh', employeeCount: 120, domain: 'finpay.sa', linkedinUrl: 'https://linkedin.com/in/mohammedkhan', title: 'Head of Business Development', phone: '+966551234567' } },
  { firstName: 'Fatima', lastName: 'Al Zahrani', email: 'fatima@fashionhub.ae', phone: '+971503456789', source: 'linkedin_scrape', status: 'enriched' as const, enrichmentData: { companyName: 'Fashion Hub MENA', industry: 'Fashion & Apparel', country: 'UAE', city: 'Dubai', employeeCount: 55, domain: 'fashionhub.ae', linkedinUrl: 'https://linkedin.com/in/fatimazahrani', title: 'E-Commerce Director', phone: '+971503456789' } },
  { firstName: 'Omar', lastName: 'Khalifa', email: 'omar@cloudtechme.com', phone: '+971504567890', source: 'apollo', status: 'messaged' as const, enrichmentData: { companyName: 'CloudTech Middle East', industry: 'Technology', country: 'UAE', city: 'Dubai', employeeCount: 320, domain: 'cloudtechme.com', linkedinUrl: 'https://linkedin.com/in/omarkhalifa', title: 'CTO', phone: '+971504567890' } },
  { firstName: 'Layla', lastName: 'Nasser', email: 'layla@beautybay.ae', phone: '+971505678901', source: 'google_search', status: 'new' as const, enrichmentData: { companyName: 'Beauty Bay Arabia', industry: 'Beauty & Cosmetics', country: 'UAE', city: 'Sharjah', employeeCount: 40, domain: 'beautybay.ae', linkedinUrl: 'https://linkedin.com/in/laylanasser', title: 'Founder & CEO', phone: '+971505678901' } },
  { firstName: 'Khalid', lastName: 'Al Dosari', email: 'khalid@petroserv.sa', phone: '+966552345678', source: 'apollo', status: 'enriched' as const, enrichmentData: { companyName: 'PetroServ Industries', industry: 'Oil & Gas', country: 'KSA', city: 'Dammam', employeeCount: 1200, domain: 'petroserv.sa', linkedinUrl: 'https://linkedin.com/in/khaliddosari', title: 'Procurement Manager', phone: '+966552345678' } },
  { firstName: 'Noura', lastName: 'Al Suwaidi', email: 'noura@smartlogistics.ae', phone: '+971506789012', source: 'linkedin_scrape', status: 'replied' as const, enrichmentData: { companyName: 'Smart Logistics UAE', industry: 'Logistics & Supply Chain', country: 'UAE', city: 'Dubai', employeeCount: 180, domain: 'smartlogistics.ae', linkedinUrl: 'https://linkedin.com/in/nourasuwaidi', title: 'Chief Commercial Officer', phone: '+971506789012' } },
  { firstName: 'Rashed', lastName: 'Al Mubarak', email: 'rashed@eatlocalme.com', phone: '+971507890123', source: 'google_search', status: 'cold' as const, enrichmentData: { companyName: 'EatLocal ME', industry: 'Food & Beverage', country: 'UAE', city: 'Dubai', employeeCount: 65, domain: 'eatlocalme.com', linkedinUrl: 'https://linkedin.com/in/rashedmubarak', title: 'Operations Head', phone: '+971507890123' } },
  { firstName: 'Hessa', lastName: 'Al Shamsi', email: 'hessa@edutechgulf.com', phone: '+971508901234', source: 'apollo', status: 'processing' as const, enrichmentData: { companyName: 'EduTech Gulf', industry: 'Education Technology', country: 'UAE', city: 'Abu Dhabi', employeeCount: 95, domain: 'edutechgulf.com', linkedinUrl: 'https://linkedin.com/in/hessashamsi', title: 'Growth Lead', phone: '+971508901234' } },
  { firstName: 'Youssef', lastName: 'Habib', email: 'youssef@paygateway.ae', phone: '+971509012345', source: 'apollo', status: 'enriched' as const, enrichmentData: { companyName: 'PayGateway MENA', industry: 'FinTech', country: 'UAE', city: 'Dubai', employeeCount: 150, domain: 'paygateway.ae', linkedinUrl: 'https://linkedin.com/in/youssefhabib', title: 'Head of Partnerships', phone: '+971509012345' } },
  { firstName: 'Amira', lastName: 'Farouk', email: 'amira@travelease.sa', phone: '+966553456789', source: 'linkedin_scrape', status: 'messaged' as const, enrichmentData: { companyName: 'TravelEase Saudi', industry: 'Travel & Hospitality', country: 'KSA', city: 'Jeddah', employeeCount: 75, domain: 'travelease.sa', linkedinUrl: 'https://linkedin.com/in/amirafarouk', title: 'Business Development Manager', phone: '+966553456789' } },
];

async function main(): Promise<void> {
  const passwordHash = hashPassword(demoUserPassword);

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@lead-flood.local' },
    update: {
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
      passwordHash,
    },
    create: {
      email: 'demo@lead-flood.local',
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
      passwordHash,
    },
  });

  // Create ICP profiles if none exist
  const existingIcps = await prisma.icpProfile.count();
  let icpId: string;

  if (existingIcps === 0) {
    const icp = await prisma.icpProfile.create({
      data: {
        name: 'UAE E-Commerce SMBs',
        description: 'Small-to-medium e-commerce businesses in UAE looking for conversational commerce solutions',
        qualificationLogic: 'WEIGHTED',
        targetIndustries: ['Retail', 'Fashion & Apparel', 'Beauty & Cosmetics', 'Food & Beverage'],
        targetCountries: ['UAE', 'KSA'],
        minCompanySize: 20,
        maxCompanySize: 500,
        requiredTechnologies: [],
        excludedDomains: ['google.com', 'facebook.com'],
        isActive: true,
        createdByUserId: demoUser.id,
      },
    });
    icpId = icp.id;

    await prisma.icpProfile.create({
      data: {
        name: 'GCC Enterprise FinTech',
        description: 'Enterprise financial technology companies across the GCC region',
        qualificationLogic: 'WEIGHTED',
        targetIndustries: ['Financial Services', 'FinTech', 'Banking'],
        targetCountries: ['UAE', 'KSA', 'Bahrain', 'Qatar'],
        minCompanySize: 50,
        maxCompanySize: 5000,
        requiredTechnologies: [],
        excludedDomains: [],
        isActive: true,
        createdByUserId: demoUser.id,
      },
    });

    await prisma.icpProfile.create({
      data: {
        name: 'MENA Tech Startups',
        description: 'Technology startups in MENA region with Series A+ funding',
        qualificationLogic: 'WEIGHTED',
        targetIndustries: ['Technology', 'SaaS', 'Education Technology'],
        targetCountries: ['UAE', 'KSA', 'Egypt', 'Jordan'],
        minCompanySize: 10,
        maxCompanySize: 200,
        requiredTechnologies: ['React', 'Node.js'],
        excludedDomains: [],
        isActive: true,
        createdByUserId: demoUser.id,
      },
    });
  } else {
    const firstIcp = await prisma.icpProfile.findFirst({ where: { isActive: true } });
    icpId = firstIcp!.id;
  }

  // Seed fake leads
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
        enrichmentData: leadData.enrichmentData,
      },
      create: {
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        email: leadData.email,
        phone: leadData.phone,
        source: leadData.source,
        status: leadData.status,
        enrichmentData: leadData.enrichmentData,
      },
    });

    // Create message drafts for messaged/replied leads
    if (leadData.status === 'messaged' || leadData.status === 'replied') {
      const existingDraft = await prisma.messageDraft.findFirst({
        where: { leadId: lead.id },
      });

      if (!existingDraft) {
        const draft = await prisma.messageDraft.create({
          data: {
            leadId: lead.id,
            icpProfileId: icpId,
            promptVersion: 'v1.0',
            generatedByModel: 'gpt-4o-mini',
            approvalStatus: 'APPROVED',
            approvedByUserId: demoUser.id,
            approvedAt: new Date(),
            followUpNumber: 0,
            pitchedFeature: 'WhatsApp Commerce',
          },
        });

        const variant = await prisma.messageVariant.create({
          data: {
            messageDraftId: draft.id,
            variantKey: 'A',
            channel: 'EMAIL',
            subject: `${leadData.firstName}, transform your sales with WhatsApp Commerce`,
            bodyText: `Hi ${leadData.firstName},\n\nI noticed ${leadData.enrichmentData.companyName} is doing great things in ${leadData.enrichmentData.industry}. We help companies like yours increase sales by 3x through WhatsApp conversational commerce.\n\nWould you be open to a 15-minute call this week?\n\nBest,\nZbooni Sales Team`,
            bodyHtml: null,
            ctaText: 'Book a Demo',
            qualityScore: 0.85,
            isSelected: true,
          },
        });

        await prisma.messageSend.create({
          data: {
            leadId: lead.id,
            messageDraftId: draft.id,
            messageVariantId: variant.id,
            channel: 'EMAIL',
            provider: 'RESEND',
            status: leadData.status === 'replied' ? 'REPLIED' : 'SENT',
            idempotencyKey: `seed-${lead.id}-${Date.now()}`,
            sentAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
            ...(leadData.status === 'replied' ? { repliedAt: new Date(Date.now() - 86400000) } : {}),
          },
        });
      }
    }
  }

  // Create some pending drafts
  const enrichedLeads = await prisma.lead.findMany({
    where: { status: 'enriched' },
    take: 3,
  });

  for (const lead of enrichedLeads) {
    const existingDraft = await prisma.messageDraft.findFirst({
      where: { leadId: lead.id, approvalStatus: 'PENDING' },
    });

    if (!existingDraft) {
      const draft = await prisma.messageDraft.create({
        data: {
          leadId: lead.id,
          icpProfileId: icpId,
          promptVersion: 'v1.0',
          generatedByModel: 'gpt-4o-mini',
          approvalStatus: 'PENDING',
          followUpNumber: 0,
          pitchedFeature: 'Payment Links',
        },
      });

      const enrichment = lead.enrichmentData as Record<string, unknown> | null;
      const company = enrichment?.companyName ?? 'your company';

      await prisma.messageVariant.create({
        data: {
          messageDraftId: draft.id,
          variantKey: 'A',
          channel: 'EMAIL',
          subject: `Quick question about ${company}'s checkout experience`,
          bodyText: `Hi ${lead.firstName},\n\nI was looking at ${company} and noticed you might benefit from instant payment links on WhatsApp.\n\nOur clients see 40% higher conversion rates vs traditional checkout.\n\nWould you be open to a quick chat?\n\nBest,\nZbooni Team`,
          bodyHtml: null,
          ctaText: 'Learn More',
          qualityScore: 0.78,
          isSelected: false,
        },
      });

      await prisma.messageVariant.create({
        data: {
          messageDraftId: draft.id,
          variantKey: 'B',
          channel: 'WHATSAPP',
          subject: null,
          bodyText: `Hi ${lead.firstName}! I'm from Zbooni - we help businesses like ${company} sell directly through WhatsApp. Would love to show you how our payment links work. Free to chat this week?`,
          bodyHtml: null,
          ctaText: null,
          qualityScore: 0.82,
          isSelected: false,
        },
      });
    }
  }

  console.log(`Seeded ${FAKE_LEADS.length} leads, ICPs, and message drafts.`);
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
