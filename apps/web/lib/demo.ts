import type { Data, Meeting, Action, Segment } from "@flowmind/shared";
const day = (n: number, h = 17) =>
  new Date(Date.UTC(2026, 9, n, h)).toISOString();
export const demoSegments: Segment[] = [
  {
    speaker: "Pelumi Martins",
    startSec: 0,
    endSec: 48,
    text: "Let’s align on the FlowMind beta. We have the transcription pipeline working, and our priority this sprint is making the meeting-to-action experience feel seamless.",
  },
  {
    speaker: "Sarah Chen",
    startSec: 48,
    endSec: 109,
    text: "The new dashboard designs are ready. I’ll share the final Figma components and the mobile layouts by Thursday. The action detail panel should always show the original quote.",
  },
  {
    speaker: "David Okafor",
    startSec: 109,
    endSec: 182,
    text: "I’ll finish the resumable upload endpoint by Friday. We should cap uploads at two gigabytes and retry each pipeline stage independently. The workspace checks must happen in every query.",
  },
  {
    speaker: "Pelumi Martins",
    startSec: 182,
    endSec: 243,
    text: "Agreed. We’re using separate queues and authenticated WebSocket rooms. I’ll document the pipeline architecture and the failure recovery strategy by Wednesday.",
  },
  {
    speaker: "Amara Johnson",
    startSec: 243,
    endSec: 312,
    text: "I’ll draft the beta onboarding emails and the feedback survey by Thursday. For the first release, let’s invite a small group of teams and learn from their weekly workflows.",
  },
  {
    speaker: "Sarah Chen",
    startSec: 312,
    endSec: 384,
    text: "We decided to keep the first release focused on upload, transcription, summaries, and the action board. Calendar integrations can follow once we validate the core experience.",
  },
  {
    speaker: "David Okafor",
    startSec: 384,
    endSec: 461,
    text: "I’ll add tenant isolation tests and make sure a member cannot open a private meeting they did not upload. I’ll have those tests ready on Friday.",
  },
  {
    speaker: "Pelumi Martins",
    startSec: 461,
    endSec: 528,
    text: "Let’s aim for a beta review next Monday. I’ll schedule the review and share a checklist today. Each owner should move their actions into progress as they start.",
  },
];
export function initialData(): Data {
  const members: any[] = [
    {
      id: "u1",
      name: "Pelumi Martins",
      email: "pelumi@marpel.dev",
      role: "owner",
      joinedAt: day(1),
      timezone: "Africa/Lagos",
    },
    {
      id: "u2",
      name: "Sarah Chen",
      email: "sarah@example.com",
      role: "admin",
      joinedAt: day(2),
    },
    {
      id: "u3",
      name: "David Okafor",
      email: "david@example.com",
      role: "member",
      joinedAt: day(2),
    },
    {
      id: "u4",
      name: "Amara Johnson",
      email: "amara@example.com",
      role: "member",
      joinedAt: day(3),
    },
  ];
  const titles = [
    "FlowMind beta · Sprint planning",
    "Product design review",
    "Engineering weekly sync",
    "Customer discovery · Acme",
    "Q4 roadmap alignment",
    "Growth & onboarding workshop",
    "API architecture review",
    "Team retrospective",
  ];
  const meetings: Meeting[] = titles.map((title, i) => ({
    id: "m" + (i + 1),
    title,
    date: day(5 - Math.floor(i / 2), 9 + (i % 3)),
    createdAt: day(5 - Math.floor(i / 2), 9 + (i % 3)),
    durationSeconds: [1932, 2550, 1800, 3120, 2460, 1980, 2700, 1680][i],
    participants: members.slice(0, i % 2 ? 3 : 4).map((m) => m.name),
    status: "completed",
    isPrivate: i === 6,
    context: "Align owners, milestones, and next steps.",
    stage: "notify",
    progress: 100,
    segments: demoSegments,
    summary:
      i === 0
        ? "The team aligned on the FlowMind beta launch and agreed to focus the first release on the core meeting-to-action workflow. Design, engineering, and growth owners committed to delivering their sprint tasks this week. The beta review is scheduled for next Monday."
        : "The team reviewed progress, clarified ownership, and agreed on the next deliverables. Open questions were captured for the next review, with follow-up actions assigned to the relevant owners.",
    keyDecisions: [
      "Focus the beta on upload, transcription, summaries, and action tracking.",
      "Use independent processing queues with retries for each stage.",
      "Run a small beta with selected teams before expanding integrations.",
    ],
    topics: ["Product strategy", "Beta launch", "Engineering", "Design"],
    sentiment: "positive",
    source: "sample",
  }));
  const taskTitles = [
    "Document the pipeline architecture & retry strategy",
    "Share final dashboard components",
    "Finish the resumable upload endpoint",
    "Draft beta onboarding emails",
    "Add workspace isolation tests",
    "Schedule the beta review",
    "Validate action extraction confidence",
    "Prepare the mobile navigation design",
    "Review API rate limits",
    "Write the customer discovery recap",
    "Publish the design handoff",
    "Set up the staging environment",
    "Review transcription edge cases",
    "Update the onboarding checklist",
    "Share the Q4 roadmap",
    "Create the feedback survey",
  ];
  const actions: Action[] = taskTitles.map((title, i) => ({
    id: "a" + (i + 1),
    meetingId: "m" + (i < 6 ? 1 : (i % 7) + 2),
    title,
    description:
      "Capture the agreed deliverable and share the result with the team before the next review.",
    assignedTo:
      i === 6
        ? null
        : members[[0, 1, 2, 3, 2, 0, 0, 1, 2, 0, 1, 2, 0, 3, 0, 3][i]].id,
    status: i < 2 ? "in_progress" : i > 9 ? "done" : "todo",
    priority:
      i === 0 || i === 2 || i === 4 ? "high" : i % 3 === 0 ? "low" : "medium",
    dueDate: day(
      i === 8 || i === 9 ? 4 : i === 0 ? 7 : i === 5 ? 5 : 8 + (i % 4),
    ),
    sourceQuote: demoSegments[i % demoSegments.length].text,
    sourceTimestampSec: demoSegments[i % demoSegments.length].startSec,
    confidence: 0.91 + (i % 3) * 0.02,
    notes: "",
    createdAt: day(5, 10),
    activity: [{ text: "Extracted from meeting", date: day(5, 10) }],
  }));
  return {
    user: members[0],
    workspace: {
      id: "w1",
      name: "Marpel Studio",
      slug: "marpel-studio",
      description: "Building thoughtful products, one conversation at a time.",
      plan: "starter",
    },
    members,
    meetings,
    actions,
    invites: [
      {
        id: "i1",
        email: "james@example.com",
        role: "member",
        createdAt: day(5),
      },
    ],
    settings: {
      email: true,
      slack: false,
      inApp: true,
      meetingReady: true,
      actionAssigned: true,
      dueReminder: true,
      overdueDigest: true,
      weeklyDigest: true,
      quietHours: true,
      quietStart: 22,
      quietEnd: 8,
      timezone: "Africa/Lagos",
      language: "en",
      workspaceDefaults: {
        defaultLanguage: "en",
        confidenceThreshold: 0.7,
        maxSpeakers: 10,
        actionDueDays: 7,
      },
    },
    integrations: [],
    webhooks: [],
    keys: [],
    logs: [
      {
        id: "l1",
        actorId: "u1",
        event: "meeting.completed",
        details: { meetingId: "m1", source: "Sample data" },
        createdAt: day(5, 10),
      },
      {
        id: "l2",
        actorId: "u2",
        event: "action.updated",
        details: { actionId: "a2", status: "in_progress" },
        createdAt: day(5, 9),
      },
      {
        id: "l3",
        actorId: "u1",
        event: "team.invited",
        details: { email: "james@example.com" },
        createdAt: day(5, 8),
      },
    ],
    notifications: [
      {
        id: "n1",
        title: "Your sprint meeting is ready",
        body: "6 action items are ready to review. This is sample data.",
        read: false,
        createdAt: day(5, 10),
      },
    ],
  };
}
