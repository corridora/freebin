import Account from "@/components/Account";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return <PageLoader component={Account} route="/account" params={values} />;
}
