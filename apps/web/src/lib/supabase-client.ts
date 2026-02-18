'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getWebEnv } from './env.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const env = getWebEnv();
  const supabaseKey =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    'development-placeholder';

  if (
    env.NEXT_PUBLIC_SUPABASE_URL === 'https://example.supabase.co' ||
    supabaseKey === 'development-placeholder'
  ) {
    throw new Error(
      'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  supabaseClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return supabaseClient;
}
