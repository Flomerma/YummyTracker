import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UrgencyBadge } from "@/components/urgency-badge";

describe("UrgencyBadge", () => {
  it("zeigt den deutschen Text zur Dringlichkeit", () => {
    render(<UrgencyBadge urgency="thisWeek" />);
    expect(screen.getByText("diese Woche")).toBeInTheDocument();
  });

  it("kennt einen Text fuer jede Dringlichkeitsstufe", () => {
    const alle = [
      "expired",
      "today",
      "tomorrow",
      "thisWeek",
      "ok",
      "unknown",
    ] as const;
    for (const urgency of alle) {
      const { unmount } = render(<UrgencyBadge urgency={urgency} />);
      expect(screen.getByText(/.+/)).toBeInTheDocument();
      unmount();
    }
  });
});
