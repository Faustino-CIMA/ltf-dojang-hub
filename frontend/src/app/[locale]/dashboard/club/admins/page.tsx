import { redirect } from "next/navigation";

type ClubAdminsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ClubAdminsPage({ params }: ClubAdminsPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/club/settings#club-admins`);
}
