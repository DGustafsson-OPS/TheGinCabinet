// /juniper/blog/[id] has no page of its own: the editor lives at /edit (spec A12).
import { redirect } from "next/navigation";

type Params = Promise<{ id: string }>;

export default async function PostRedirect({ params }: { params: Params }) {
  redirect(`/juniper/blog/${(await params).id}/edit`);
}
