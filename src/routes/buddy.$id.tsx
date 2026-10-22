import { createFileRoute } from "@tanstack/react-router";
import { BuddyProfilePage } from "@/features/account/buddy-profile";
export const Route=createFileRoute("/buddy/$id")({component:Page});
function Page(){return <BuddyProfilePage id={Route.useParams().id}/>;}
