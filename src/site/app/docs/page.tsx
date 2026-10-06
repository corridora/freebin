import Docs from "@/components/Docs";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return <PageLoader component={Docs} route="/docs" params={values} />;
}
