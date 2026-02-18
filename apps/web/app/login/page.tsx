'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '../../src/hooks/use-auth.js';
import { ApiError } from '../../src/lib/api-client.js';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      router.replace('/');
    } catch (submitError: unknown) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError('Login failed — please try again');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {/* Subtle background gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/4 h-[800px] w-[800px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #7BFF6B 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-1/2 -right-1/4 h-[600px] w-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #3CC8E0 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-[380px]">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-block">
            <Image
              src="/zbooni-logo-dark.png"
              alt="Zbooni"
              width={200}
              height={200}
              priority
              className="mx-auto invert"
            />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Sales OS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your pipeline
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-xl shadow-black/20">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="you@zbooni.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="zbooni-gradient-bg inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-zbooni-dark shadow-lg shadow-zbooni-green/20 transition-all hover:opacity-90 hover:shadow-zbooni-green/30 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zbooni-dark/30 border-t-zbooni-dark" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Powered by Lead Flood
        </p>
      </div>
    </div>
  );
}
