"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { resolveAssignedClubId, useClubSelection } from "@/components/club-selection-provider";
import {
  formatWelcomeDate,
  formatWelcomeShortDate,
  parseIsoDate,
  WelcomeOverview,
  type WelcomeAttention,
  type WelcomeTile,
} from "@/components/welcome-overview";
import { apiRequest } from "@/lib/api";
import {
  Club,
  License,
  Member,
  getClubs,
  getLicenses,
  getMemberTransfers,
  getMembers,
} from "@/lib/club-admin-api";
import { getClubTeams } from "@/lib/club-teams-api";
import { COMPETITION_MODULE_ID, getModuleStatus, isClubModuleAssigned } from "@/lib/modules-api";
import { formatFullName } from "@/lib/person-name";

type MeResponse = {
  first_name: string;
  username: string;
};

export default function ClubAdminOverviewPage() {
  const t = useTranslations("ClubAdmin");
  const home = useTranslations("Home");
  const locale = useLocale();
  const { selectedClubId, setSelectedClubId } = useClubSelection();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [incomingTransferCount, setIncomingTransferCount] = useState(0);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [firstName, setFirstName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setTeamCount(null);
    try {
      const [clubsResponse, membersResponse, licensesResponse, transfersResponse, me] = await Promise.all([
        getClubs(),
        getMembers(),
        getLicenses(),
        getMemberTransfers().catch(() => []),
        apiRequest<MeResponse>("/api/auth/me/"),
      ]);
      setClubs(clubsResponse);
      setMembers(membersResponse);
      setLicenses(licensesResponse);
      setFirstName(me.first_name?.trim() || me.username);
      const effectiveClubId = resolveAssignedClubId(clubsResponse, selectedClubId);
      if (effectiveClubId !== selectedClubId) {
        setSelectedClubId(effectiveClubId);
      }
      const administeredIds = new Set(clubsResponse.map((club) => club.id));
      setIncomingTransferCount(
        transfersResponse.filter((item) => {
          if (item.status !== "pending") {
            return false;
          }
          if (effectiveClubId) {
            return item.to_club.id === effectiveClubId;
          }
          return administeredIds.has(item.to_club.id);
        }).length
      );
      setIsLoading(false);

      if (!effectiveClubId) {
        setTeamCount(null);
        return;
      }
      try {
        const modules = await getModuleStatus();
        if (!isClubModuleAssigned(modules, COMPETITION_MODULE_ID, effectiveClubId)) {
          setTeamCount(null);
          return;
        }
        const teams = await getClubTeams(effectiveClubId);
        setTeamCount(teams.length);
      } catch {
        setTeamCount(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
      setIsLoading(false);
    }
  }, [selectedClubId, setSelectedClubId, t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeClubId = resolveAssignedClubId(clubs, selectedClubId);
  const clubName = clubs.find((club) => club.id === activeClubId)?.name ?? "";

  const filteredMembers = useMemo(() => {
    if (!activeClubId) {
      return members;
    }
    return members.filter((member) => member.club === activeClubId);
  }, [members, activeClubId]);

  const filteredLicenses = useMemo(() => {
    if (!activeClubId) {
      return licenses;
    }
    return licenses.filter((license) => license.club === activeClubId);
  }, [licenses, activeClubId]);

  const activeMembers = useMemo(
    () => filteredMembers.filter((member) => member.is_active),
    [filteredMembers]
  );

  const memberById = useMemo(() => {
    const map = new Map<number, Member>();
    filteredMembers.forEach((member) => map.set(member.id, member));
    return map;
  }, [filteredMembers]);

  const expiring = useMemo(() => {
    const today = startOfToday();
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    return filteredLicenses
      .filter((license) => {
        if (license.status !== "active") {
          return false;
        }
        const end = parseIsoDate(license.end_date);
        return Boolean(end && end >= today && end <= limit);
      })
      .sort((left, right) => left.end_date.localeCompare(right.end_date));
  }, [filteredLicenses]);

  const coveredMemberIds = useMemo(() => {
    const ids = new Set<number>();
    filteredLicenses.forEach((license) => {
      if (license.status === "active" || license.status === "pending") {
        ids.add(license.member);
      }
    });
    return ids;
  }, [filteredLicenses]);

  const missingId = activeMembers.filter((member) => !member.ltf_licenseid?.trim());
  const missingDob = activeMembers.filter((member) => !member.date_of_birth);
  const noLicence = activeMembers.filter((member) => !coveredMemberIds.has(member.id));

  const nextExpiring = expiring[0];
  const nextMember = nextExpiring ? memberById.get(nextExpiring.member) : undefined;
  const tiles: WelcomeTile[] = [
    {
      id: "members",
      label: home("tileActiveMembers"),
      value: String(activeMembers.length),
      unit: home("tileMemberUnit", { count: activeMembers.length }),
    },
    {
      id: "expiring",
      label: home("tileExpiring"),
      value: String(expiring.length),
      unit: home("tileLicenceUnit", { count: expiring.length }),
      hint:
        nextExpiring && nextMember
          ? home("welcomeNext", {
              name: formatFullName(nextMember),
              date: formatWelcomeShortDate(locale, nextExpiring.end_date),
            })
          : undefined,
    },
  ];
  if (teamCount !== null) {
    tiles.push({
      id: "teams",
      label: home("tileTeams"),
      value: String(teamCount),
      unit: home("tileTeamUnit", { count: teamCount }),
    });
  }

  const attention: WelcomeAttention[] = [];
  if (expiring.length > 0) {
    attention.push({
      id: "expiring",
      label: home("welcomeExpiring", { count: expiring.length }),
      detail: nameList(expiring.map((license) => memberById.get(license.member)).filter(isMember)),
      href: `/${locale}/dashboard/club/licenses`,
    });
  }
  if (missingId.length > 0) {
    attention.push({
      id: "missing-id",
      label: home("welcomeMissingId", { count: missingId.length }),
      detail: nameList(missingId),
      href: `/${locale}/dashboard/club/members?issue=missing_ltf_licenseid`,
    });
  }
  if (missingDob.length > 0) {
    attention.push({
      id: "missing-dob",
      label: home("welcomeMissingDob", { count: missingDob.length }),
      detail: nameList(missingDob),
      href: `/${locale}/dashboard/club/members`,
    });
  }
  if (noLicence.length > 0) {
    attention.push({
      id: "no-licence",
      label: home("welcomeNoLicence", { count: noLicence.length }),
      detail: nameList(noLicence),
      href: `/${locale}/dashboard/club/members?issue=no_valid_license`,
    });
  }
  if (incomingTransferCount > 0) {
    attention.push({
      id: "transfers",
      label: home("welcomeTransfers", { count: incomingTransferCount }),
      href: `/${locale}/dashboard/club/transfers`,
    });
  }

  return (
    <ClubAdminLayout
      title={firstName ? `${home("welcomeLead")} ${firstName}.` : home("welcomeLead")}
      subtitle={clubName}
    >
      <WelcomeOverview
        eyebrow={clubName}
        firstName={firstName}
        dateLabel={isLoading ? "" : formatWelcomeDate(locale)}
        tiles={isLoading ? [] : tiles}
        attention={isLoading ? [] : attention}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onDismissError={() => setErrorMessage(null)}
      />
    </ClubAdminLayout>
  );
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function isMember(value: Member | undefined): value is Member {
  return Boolean(value);
}

function nameList(members: Member[]) {
  const names = members.slice(0, 3).map((member) => formatFullName(member));
  return names.join(", ");
}
