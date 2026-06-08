export type PcGamePassEntry = {
  title: string;
  type: "coming-soon" | "new" | "leaving-soon";
  date?: string;
  platform: "PC";
  officialUrl: string;
  imageUrl?: string;
  sourceName: "Xbox";
  sourceUrl: string;
  checkedAt: string;
  status: "draft" | "approved";
};

// Entries are curated manually. Drafts never appear on public pages.
export const pcGamePassEntries: PcGamePassEntry[] = [];

export const approvedPcGamePassEntries = pcGamePassEntries.filter(
  (entry) => entry.status === "approved" && entry.platform === "PC"
);
