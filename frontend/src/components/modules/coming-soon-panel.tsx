import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";

type ComingSoonPanelProps = {
  title: string;
  description: string;
};

export function ComingSoonPanel({ title, description }: ComingSoonPanelProps) {
  return <EmptyState title={title} description={description} icon={Sparkles} />;
}
