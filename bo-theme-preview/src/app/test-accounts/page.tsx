import { notFound } from 'next/navigation';
import { TestAccounts } from '@/components/TestAccounts';
import { testAccountsEnabled } from '@/lib/backend/test-accounts';

export const dynamic = 'force-dynamic';
export default function TestAccountsPage() {
  if (!testAccountsEnabled()) notFound();
  return <TestAccounts/>;
}
