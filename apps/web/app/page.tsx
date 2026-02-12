import { getWebEnv } from '../src/lib/env';

export default function HomePage() {
  const env = getWebEnv();

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Lead Onslaught</h1>
      <p>Phase 0 skeleton is running.</p>
      <p>
        API Base URL: <code>{env.NEXT_PUBLIC_API_BASE_URL}</code>
      </p>
      <p>
        Health endpoint:{' '}
        <a href={`${env.NEXT_PUBLIC_API_BASE_URL}/health`} target="_blank" rel="noreferrer">
          {`${env.NEXT_PUBLIC_API_BASE_URL}/health`}
        </a>
      </p>
    </main>
  );
}
