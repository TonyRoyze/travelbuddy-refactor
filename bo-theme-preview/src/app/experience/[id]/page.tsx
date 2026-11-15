import { notFound } from 'next/navigation';
import { getExperience } from '@/lib/catalog';
import { ExperiencePage } from '@/components/ExperienceDetails';
export default function Page({ params }: { params: { id: string } }) { if (!getExperience(params.id)) notFound(); return <ExperiencePage key={params.id} id={params.id}/>; }
