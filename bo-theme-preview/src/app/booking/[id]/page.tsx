import { BookingPage } from '@/components/CustomerBookings';
export default function Page({ params }: { params: { id: string } }) { return <BookingPage id={params.id}/>; }
