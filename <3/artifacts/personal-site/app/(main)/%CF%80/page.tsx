import { DirectoryContent } from "@/components/WorkspacePage";
export const dynamic = "error";
export const metadata = { title: { absolute: 'π' }, alternates: { canonical: '/π' } };
export default function Page() { return <DirectoryContent directory='π' />; }
