import { ConfirmationPage } from '@/components/CustomerBookings';
export default function Page({ params }: { params: { id: string } }) { return <ConfirmationPage id={params.id}/>; }
