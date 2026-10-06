import Consent from "@/components/Consent";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return (
    <PageLoader component={Consent} route="/oauth/authorize" params={values} />
  );
}
