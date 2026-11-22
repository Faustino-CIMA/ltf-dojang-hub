"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { API_URL } from "@/lib/api";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { getToken } from "@/lib/auth";

export function DownloadMyData({
  memberId,
  locale,
  minor,
  admin = false,
}: {
  memberId: number;
  locale: string;
  minor: boolean;
  admin?: boolean;
}) {
  const t = useTranslations("Member");
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function download(fileFormat: "json" | "pdf" | "csv" | "xlsx") {
    setErrorMessage(null);
    const token = getToken();
    const desk = readActiveDeskHeader();
    const response = await fetch(
      `${API_URL}/api/members/${memberId}/my-data/?file_format=${fileFormat}&locale=${encodeURIComponent(locale)}`,
      {
        headers: {
          ...(token ? { Authorization: `Token ${token}` } : {}),
          ...(desk ? { "X-Desk": desk } : {}),
        },
      },
    );
    if (!response.ok) {
      setErrorMessage(t("myDataFailed"));
      return;
    }
    const blob = await response.blob();
    const extension = fileFormat === "csv" ? "zip" : fileFormat;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `my-data.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Download aria-hidden />
        {admin ? t("myDataAdminButton") : t("myDataButton")}
      </Button>
      <SidePanel
        open={open}
        title={admin ? t("myDataAdminButton") : t("myDataTitle")}
        closeLabel={common("modalClose")}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">{t("myDataHint")}</p>
          {minor ? <p className="text-sm text-foreground">{t("myDataMinor")}</p> : null}
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => void download("json")}>
              <FileText aria-hidden />
              {t("myDataJson")}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => void download("pdf")}>
              <FileText aria-hidden />
              {t("myDataPdf")}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => void download("csv")}>
              <FileSpreadsheet aria-hidden />
              {t("myDataCsv")}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => void download("xlsx")}>
              <FileSpreadsheet aria-hidden />
              {t("myDataXlsx")}
            </Button>
          </div>
        </div>
      </SidePanel>
    </>
  );
}
