import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GoogleLogoutButton } from '@/components/GoogleLogoutButton';
import { sessionAccount } from '@/lib/backend/sessions';
import { SESSION_COOKIE } from '@/lib/backend/auth-security';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const account = await sessionAccount(cookies().get(SESSION_COOKIE)?.value);
  if (!account) redirect('/login');
  if (account.data.onboarding === 'pending') redirect('/register/google');
  return <div className="page-width google-account-page standard-page"><h1>Hello, {account.data.displayName}.</h1><p>You’re signed in with Google.</p><section className="settings-panel"><h2>Your TravelBuddy account</h2><p>Your account is saved securely on the server. Travel experiences, trip planning, and booking flows are still demonstrations.</p><p>Account access: {account.data.roles.join(', ')}</p><div className="google-account-actions"><Link className="button button-primary" href="/">Explore experiences</Link><GoogleLogoutButton /></div></section></div>;
}
