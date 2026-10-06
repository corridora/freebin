import Inspector from "@/components/Inspector";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return <PageLoader component={Inspector} route="/bin/[id]" params={values} />;
}
