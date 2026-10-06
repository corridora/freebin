import Home from "@/components/Home";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return <PageLoader component={Home} route="/" params={values} />;
}
