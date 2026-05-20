import Shell from "@/components/Shell";
import { getAdminData, getCafeConfig } from "@/lib/actions";
import { currentPwaUser } from "@/lib/auth";
import { centres } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

const CAFE_CENTRE = "ccg"; // the cafe tablet is fixed to one centre (matches reference)

export default async function Home() {
  const [cafeConfig, adminData, pwaUser] = await Promise.all([
    getCafeConfig(CAFE_CENTRE),
    getAdminData("ccg"),
    currentPwaUser(),
  ]);

  return (
    <Shell
      centres={centres}
      cafeCentreId={CAFE_CENTRE}
      initialCafeConfig={cafeConfig}
      initialAdminData={adminData}
      initialPwaUser={pwaUser}
    />
  );
}
