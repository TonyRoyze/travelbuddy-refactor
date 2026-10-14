import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { sessionAccount } from '@/lib/backend/sessions';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const account = await sessionAccount();
  if (!account) redirect('/login');
  if (account.data.onboarding === 'pending') redirect('/register/complete');
  return <div className="page-width authenticated-account-page standard-page"><h1>Hello, {account.data.displayName}.</h1><p>You’re signed in securely.</p><section className="settings-panel"><h2>Your TravelBuddy account</h2><p>Your account is saved securely on the server. Travel experiences, trip planning, and booking flows are still demonstrations.</p><p>Account access: {account.data.roles.join(', ')}</p><div className="authenticated-account-actions"><Link className="button button-primary" href="/">Explore experiences</Link><LogoutButton /></div></section></div>;
}
