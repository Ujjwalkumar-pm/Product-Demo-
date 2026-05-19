import Shell from "@/components/Shell";
import { getAdminData, getCafeConfig } from "@/lib/actions";
import { centres } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

const CAFE_CENTRE = "ccg"; // the cafe tablet is fixed to one centre (matches reference)

export default async function Home() {
  const [cafeConfig, adminData] = await Promise.all([
    getCafeConfig(CAFE_CENTRE),
    getAdminData("ccg"),
  ]);

  return (
    <Shell
      centres={centres}
      cafeCentreId={CAFE_CENTRE}
      initialCafeConfig={cafeConfig}
      initialAdminData={adminData}
    />
  );
}
