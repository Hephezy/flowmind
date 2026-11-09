import { describe, it, expect, vi } from "vitest";
import { matchAssignee, isOverdue, extractionSchema } from "@flowmind/shared";
import {
  admin,
  owner,
  visibleMeetings,
  visibleActions,
  getMeeting,
  encrypt,
  decrypt,
  publicIp,
} from "../src/core";
import { quietDelay } from "../src/notifications";
const member = {
  id: "user-a",
  workspaceId: "workspace-a",
  role: "member" as const,
};
describe("workspace boundaries", () => {
  it("scopes meeting reads to the tenant and the uploader for private records", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      getMeeting({ meeting: { findFirst } } as any, member, "foreign"),
    ).rejects.toThrow("Meeting not found");
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "foreign",
      workspaceId: "workspace-a",
      OR: [{ isPrivate: false }, { uploadedBy: "user-a" }],
    });
  });
  it("includes manual tasks and excludes inaccessible meeting tasks", () => {
    expect(visibleActions(member)).toEqual({
      workspaceId: "workspace-a",
      OR: [
        { meetingId: null },
        { meeting: { isPrivate: false } },
        { meeting: { uploadedBy: "user-a" } },
      ],
    });
  });
  it("keeps billing exclusive to owners", () => {
    expect(() => admin(member)).toThrow();
    expect(() => owner({ ...member, role: "admin" })).toThrow();
    expect(() => owner({ ...member, role: "owner" })).not.toThrow();
  });
});
describe("AI extraction and task deadlines", () => {
  it("leaves ambiguous names unassigned", () => {
    expect(
      matchAssignee("Sarah", [
        { id: "1", name: "Sarah Chen" },
        { id: "2", name: "Sarah Smith" },
      ]),
    ).toBeNull();
    expect(matchAssignee("Sarah Chen", [{ id: "1", name: "Sarah Chen" }])).toBe(
      "1",
    );
  });
  it("validates confidence bounds and statuses", () => {
    expect(
      extractionSchema.safeParse({
        actions: [
          {
            title: "x",
            assigneeName: null,
            dueDate: null,
            priority: "urgent",
            sourceQuote: "x",
            sourceTimestampSec: 0,
            confidence: 1.1,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("never treats completed actions as overdue", () => {
    expect(isOverdue({ status: "done", dueDate: "2020-01-01" })).toBe(false);
    expect(isOverdue({ status: "todo", dueDate: "2020-01-01" })).toBe(true);
  });
});
describe("delivery security", () => {
  it("respects overnight quiet hours in Lagos", () => {
    const now = Date.parse("2026-10-05T22:00:00Z");
    expect(
      quietDelay(
        { quietHours: true, quietStart: 22, quietEnd: 8 },
        "Africa/Lagos",
        now,
      ),
    ).toBe(9 * 3600000);
  });
  it("handles same-day quiet windows", () => {
    expect(
      quietDelay(
        { quietHours: true, quietStart: 9, quietEnd: 17 },
        "Etc/UTC",
        Date.parse("2026-10-05T12:00:00Z"),
      ),
    ).toBe(5 * 3600000);
  });
  it("rejects private and metadata IP destinations", () => {
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.1",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ])
      expect(publicIp(ip)).toBe(false);
    expect(publicIp("8.8.8.8")).toBe(true);
  });
  it("encrypts credentials with authenticated encryption", () => {
    process.env.ENCRYPTION_KEY = "01".repeat(32);
    const encrypted = encrypt("private-token");
    expect(encrypted).not.toContain("private-token");
    expect(decrypt(encrypted)).toBe("private-token");
    expect(() => decrypt(encrypted.slice(0, -2) + "ff")).toThrow();
  });
});
