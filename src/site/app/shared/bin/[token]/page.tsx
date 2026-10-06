import SharedBin from "@/components/SharedBin";
import { PageLoader } from "@/components/PageLoader";
export default async function Page({
  params,
}: {
  params: Promise<Record<string, string>>;
}) {
  const values = await params;
  return (
    <PageLoader
      component={SharedBin}
      route="/shared/bin/[token]"
      params={values}
    />
  );
}
