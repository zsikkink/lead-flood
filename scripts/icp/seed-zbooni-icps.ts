import { prisma } from '@lead-flood/db';

const SUPPORTED_COUNTRIES = ['UAE', 'KSA', 'Jordan', 'Egypt'] as const;

interface ZbooniRuleDefinition {
  name: string;
  fieldName: string;
  operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN' | 'CONTAINS';
  expectedValue: unknown;
  isRequired: boolean;
  weight: number;
  orderIndex: number;
}

interface ZbooniIcpDefinition {
  name: string;
  purpose: string;
  targetIndustries: string[];
  featureList: string[];
  rules: ZbooniRuleDefinition[];
}

export const ZBOONI_ICP_DEFINITIONS: readonly ZbooniIcpDefinition[] = [
  {
    name: 'Chat-First SMB Seller',
    purpose: 'High-intent SMB sellers that are conversation-first and socially active.',
    targetIndustries: ['Retail', 'Fashion', 'Food & Beverage', 'Beauty'],
    featureList: [
      'Catalog (CShop) to pre-list services and share them directly via chat',
      'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
      'Live payment link editing without creating new links',
      'In-app discount creation',
      'Promo code creation and management',
      'WhatsApp marketing campaigns for new customer acquisition',
    ],
    rules: [
      {
        name: 'Country in supported MENA region',
        fieldName: 'country',
        operator: 'IN',
        expectedValue: [...SUPPORTED_COUNTRIES],
        isRequired: true,
        weight: 0,
        orderIndex: 1,
      },
      {
        name: 'Industry supported',
        fieldName: 'industry_supported',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 2,
      },
      {
        name: 'Has WhatsApp',
        fieldName: 'has_whatsapp',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 3,
        orderIndex: 3,
      },
      {
        name: 'Has Instagram',
        fieldName: 'has_instagram',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 4,
      },
      {
        name: 'Accepts online payments',
        fieldName: 'accepts_online_payments',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 3,
        orderIndex: 5,
      },
      {
        name: 'Review count above 10',
        fieldName: 'review_count',
        operator: 'GT',
        expectedValue: 10,
        isRequired: false,
        weight: 2,
        orderIndex: 6,
      },
      {
        name: 'Follower count above 500',
        fieldName: 'follower_count',
        operator: 'GT',
        expectedValue: 500,
        isRequired: false,
        weight: 1,
        orderIndex: 7,
      },
      {
        name: 'Physical address present',
        fieldName: 'physical_address_present',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 1,
        orderIndex: 8,
      },
      {
        name: 'Recent activity detected',
        fieldName: 'recent_activity',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 9,
      },
      {
        name: 'Custom order signals',
        fieldName: 'custom_order_signals',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 10,
      },
      {
        name: 'Pure self-serve ecom anti-fit',
        fieldName: 'pure_self_serve_ecom',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: -3,
        orderIndex: 11,
      },
    ],
  },
  {
    name: 'High-Touch Service Business',
    purpose: 'Service-led SMBs where conversational and assisted sales motions perform well.',
    targetIndustries: ['Professional Services', 'Education', 'Fitness'],
    featureList: [
      'Customizable payment links allowing staged or package-based payments',
      'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, Tabby, Tamara, etc.)',
      'CRM to track client history, program enrolment, and notes',
      'Promo code and discount creation for cohorts or referrals',
      'WhatsApp marketing campaigns to re-engage past clients for new programs',
      'Instant customer receipt generation',
    ],
    rules: [
      {
        name: 'Country in supported MENA region',
        fieldName: 'country',
        operator: 'IN',
        expectedValue: [...SUPPORTED_COUNTRIES],
        isRequired: true,
        weight: 0,
        orderIndex: 1,
      },
      {
        name: 'Industry in service set',
        fieldName: 'industry',
        operator: 'IN',
        expectedValue: ['Professional Services', 'Education', 'Fitness'],
        isRequired: false,
        weight: 2,
        orderIndex: 2,
      },
      {
        name: 'Accepts online payments',
        fieldName: 'accepts_online_payments',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 3,
      },
      {
        name: 'Review count above 25',
        fieldName: 'review_count',
        operator: 'GT',
        expectedValue: 25,
        isRequired: false,
        weight: 2,
        orderIndex: 4,
      },
      {
        name: 'Has booking/contact form',
        fieldName: 'has_booking_or_contact_form',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 5,
      },
      {
        name: 'Recent activity detected',
        fieldName: 'recent_activity',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 6,
      },
      {
        name: 'Variable pricing detected',
        fieldName: 'variable_pricing_detected',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 7,
      },
      {
        name: 'Physical location present',
        fieldName: 'physical_location',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 1,
        orderIndex: 8,
      },
    ],
  },
  {
    name: 'Shopify / Ecommerce Recovery',
    purpose: 'SMB ecommerce stores with signal for cart recovery and conversion lift.',
    targetIndustries: ['Ecommerce', 'Retail'],
    featureList: [
      'Support for large one-off payments on a single link (up to AED 1M per link)',
      'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
      'Multi-MID support for failed transactions, enabling retries via alternate MIDs',
      'Immediate live support via call or WhatsApp for urgent or failed transactions',
      'Catalog (CShop) to pre-list services and share them directly via chat',
      'CRM to track customer order history and add internal notes',
    ],
    rules: [
      {
        name: 'Country in supported MENA region',
        fieldName: 'country',
        operator: 'IN',
        expectedValue: [...SUPPORTED_COUNTRIES],
        isRequired: true,
        weight: 0,
        orderIndex: 1,
      },
      {
        name: 'Shopify detected',
        fieldName: 'shopify_detected',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 3,
        orderIndex: 2,
      },
      {
        name: 'Instagram active',
        fieldName: 'has_instagram',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 3,
      },
      {
        name: 'Review count above 50',
        fieldName: 'review_count',
        operator: 'GT',
        expectedValue: 50,
        isRequired: false,
        weight: 2,
        orderIndex: 4,
      },
      {
        name: 'Follower count above 3000',
        fieldName: 'follower_count',
        operator: 'GT',
        expectedValue: 3000,
        isRequired: false,
        weight: 2,
        orderIndex: 5,
      },
      {
        name: 'Accepts online payments',
        fieldName: 'accepts_online_payments',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 1,
        orderIndex: 6,
      },
      {
        name: 'Abandonment signal detected',
        fieldName: 'abandonment_signal_detected',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 7,
      },
    ],
  },
  {
    name: 'Multi-Rep SMB Growth',
    purpose: 'Growing SMBs where multi-staff workflows and engagement predict expansion.',
    targetIndustries: ['Retail', 'Services', 'Hospitality'],
    featureList: [
      'Support for large one-off payments on a single link (up to AED 1M per link)',
      'Customizable payment links allowing partial payments (deposit/balance/add-ons)',
      'International card acceptance',
      'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
      'Easy reconciliation to track payments, customers, and VAT',
      'Catalog (CShop) to pre-list services and upsells via chat or QR code',
      'CRM to track guest history, preferences, and add internal notes',
    ],
    rules: [
      {
        name: 'Country in supported MENA region',
        fieldName: 'country',
        operator: 'IN',
        expectedValue: [...SUPPORTED_COUNTRIES],
        isRequired: true,
        weight: 0,
        orderIndex: 1,
      },
      {
        name: 'Multi staff detected',
        fieldName: 'multi_staff_detected',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 3,
        orderIndex: 2,
      },
      {
        name: 'Review count above 100',
        fieldName: 'review_count',
        operator: 'GT',
        expectedValue: 100,
        isRequired: false,
        weight: 2,
        orderIndex: 3,
      },
      {
        name: 'Follower growth signal',
        fieldName: 'follower_growth_signal',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 4,
      },
      {
        name: 'High engagement signal',
        fieldName: 'high_engagement_signal',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 5,
      },
      {
        name: 'Physical store present',
        fieldName: 'physical_store_present',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 1,
        orderIndex: 6,
      },
      {
        name: 'Accepts online payments',
        fieldName: 'accepts_online_payments',
        operator: 'EQ',
        expectedValue: true,
        isRequired: false,
        weight: 2,
        orderIndex: 7,
      },
    ],
  },
] as const;

export interface SeedResult {
  createdIcpCount: number;
  ruleCountsByIcp: Array<{ icpName: string; icpProfileId: string; ruleCount: number }>;
}

export async function seedZbooniIcps(): Promise<SeedResult> {
  const summary: SeedResult = {
    createdIcpCount: 0,
    ruleCountsByIcp: [],
  };

  for (const definition of ZBOONI_ICP_DEFINITIONS) {
    const existing = await prisma.icpProfile.findFirst({
      where: { name: definition.name },
      select: { id: true },
    });

    const icpData = {
      description: definition.purpose,
      qualificationLogic: 'WEIGHTED' as const,
      metadataJson: {
        seededBy: 'scripts/icp/seed-zbooni-icps.ts',
        strategy: 'wide_net',
        purpose: definition.purpose,
      },
      targetCountries: [...SUPPORTED_COUNTRIES],
      targetIndustries: definition.targetIndustries,
      featureList: definition.featureList,
      isActive: true,
      createdByUserId: null,
    };

    const icp = existing
      ? await prisma.icpProfile.update({
          where: { id: existing.id },
          data: icpData,
        })
      : await prisma.icpProfile.create({
          data: {
            name: definition.name,
            ...icpData,
          },
        });

    await prisma.qualificationRule.deleteMany({
      where: {
        icpProfileId: icp.id,
      },
    });

    for (const rule of definition.rules) {
      await prisma.qualificationRule.create({
        data: {
          icpProfileId: icp.id,
          name: rule.name,
          ruleType: rule.isRequired ? 'HARD_FILTER' : 'WEIGHTED',
          isRequired: rule.isRequired,
          fieldKey: rule.fieldName,
          operator: rule.operator,
          valueJson: rule.expectedValue as never,
          weight: rule.isRequired ? null : rule.weight,
          orderIndex: rule.orderIndex,
          priority: rule.orderIndex,
          isActive: true,
        },
      });
    }

    summary.createdIcpCount += 1;
    summary.ruleCountsByIcp.push({
      icpName: definition.name,
      icpProfileId: icp.id,
      ruleCount: definition.rules.length,
    });
  }

  return summary;
}

async function run(): Promise<void> {
  const result = await seedZbooniIcps();

  console.log(
    JSON.stringify(
      {
        event: 'icp.seed.completed',
        createdIcpCount: result.createdIcpCount,
        ruleCountsByIcp: result.ruleCountsByIcp,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error: unknown) => {
    console.error('Failed to seed Zbooni ICP profiles', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
