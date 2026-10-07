import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GoogleOnboarding } from '@/components/GoogleOnboarding';
import { sessionAccount, publicAccount } from '@/lib/backend/sessions';
import { SESSION_COOKIE } from '@/lib/backend/auth-security';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const account = await sessionAccount(cookies().get(SESSION_COOKIE)?.value);
  if (!account) redirect('/login');
  if (account.data.onboarding === 'completed') redirect('/account/security');
  return <GoogleOnboarding account={publicAccount(account)} />;
}
