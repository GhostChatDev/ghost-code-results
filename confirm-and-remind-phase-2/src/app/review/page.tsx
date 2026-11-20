"use client";
import { Empty, PageTitle } from "@/components/ui";

// Phase 1: nothing to review. Phase 2 fills this with suggestions from the ai_suggestions table.
export default function ReviewPage() {
  return (
    <div>
      <PageTitle>Review</PageTitle>
      <Empty title="Nothing to review yet" />
    </div>
  );
}
