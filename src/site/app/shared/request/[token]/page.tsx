import SharedRequest from "@/components/SharedRequest";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return (
    <PageLoader
      component={SharedRequest}
      route="/shared/request/[token]"
      params={values}
    />
  );
}
