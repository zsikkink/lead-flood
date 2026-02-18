import { z } from 'zod';

const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:5050'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

export function getWebEnv(): WebEnv {
  const parsed = WebEnvSchema.parse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return {
    ...parsed,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      'development-placeholder',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      'development-placeholder',
  };
}
