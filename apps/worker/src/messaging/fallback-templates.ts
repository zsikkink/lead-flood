// apps/worker/src/messaging/fallback-templates.ts

export interface FallbackMessage {
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  ctaText: string | null;
}

export function getWhatsAppFallback(leadName: string, companyName: string | null): FallbackMessage {
  const greeting = leadName ? `Hi ${leadName}` : 'Hi there';
  const companyRef = companyName ? ` at ${companyName}` : '';

  return {
    subject: null,
    bodyText: `${greeting}, I came across your business${companyRef} and thought Zbooni could help streamline your sales operations. Would you be open to a quick chat about how we help businesses in the region grow their revenue through conversational commerce?`,
    bodyHtml: null,
    ctaText: null,
  };
}

export function getEmailFallback(leadName: string, companyName: string | null): FallbackMessage {
  const greeting = leadName ? `Hi ${leadName}` : 'Hello';
  const companyRef = companyName ? ` at ${companyName}` : '';

  return {
    subject: `Quick question about your sales process${companyRef}`,
    bodyText: `${greeting},\n\nI noticed your business${companyRef} and wanted to reach out. At Zbooni, we help companies in the MENA region increase their sales through WhatsApp-first commerce solutions.\n\nWould you have 15 minutes this week for a brief call? I would love to share how similar businesses have grown their revenue with our platform.\n\nBest regards`,
    bodyHtml: null,
    ctaText: null,
  };
}

export function getFallbackForChannel(
  channel: 'EMAIL' | 'WHATSAPP',
  leadName: string,
  companyName: string | null,
): FallbackMessage {
  return channel === 'WHATSAPP'
    ? getWhatsAppFallback(leadName, companyName)
    : getEmailFallback(leadName, companyName);
}
