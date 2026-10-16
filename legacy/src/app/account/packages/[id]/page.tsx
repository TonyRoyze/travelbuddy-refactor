import { BuddyPackageEditor } from '@/components/BuddyPackages';
export default function Page({ params }: { params: { id: string } }) { return <BuddyPackageEditor id={params.id} key={params.id} />; }
