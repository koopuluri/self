import { DirectoryContent } from "@/components/WorkspacePage";
export const dynamic = "error";
export const metadata = { title: { absolute: '$' }, alternates: { canonical: '/$' } };
export default function Page() { return <DirectoryContent directory='$' />; }
