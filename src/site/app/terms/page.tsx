import Terms from "@/components/Terms";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return <PageLoader component={Terms} route="/terms" params={values} />;
}
