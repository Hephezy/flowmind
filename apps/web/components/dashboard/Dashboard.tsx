"use client";
import { isOverdue } from "@flowmind/shared";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Clock,
  ListTodo,
  Plus,
} from "lucide-react";
import { MeetingRow } from "../meetings/Meetings";
import {
  Avatar,
  Badge,
  date,
  Due,
  Empty,
  Heading,
  useFlow,
} from "../ui/common";

export function Dashboard() {
  const { data, go, updateAction, openAction } = useFlow(),
    all = data.actions,
    my = all.filter((a) => a.assignedTo === data.user.id),
    done = all.filter((a) => a.status === "done").length,
    overdue = all.filter((a) => isOverdue(a));
  const pending = my.filter((a) => a.status !== "done").slice(0, 4),
    upcoming = all
      .filter((a) => a.status !== "done" && a.dueDate)
      .sort((a, b) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!))
      .slice(0, 4);
  return (
    <>
      <Heading
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title={`Good evening, ${data.user.name.split(" ")[0]}`}
        sub="Let’s turn today’s conversations into tomorrow’s progress."
      >
        <span className="today">
          <Calendar size={14} />
          Monday, October 5
        </span>
        <button className="primary" onClick={() => go("meetings/new")}>
          <Plus size={16} />
          New meeting
        </button>
      </Heading>
      <div className="stats-grid">
        {[
          {
            label: "Total meetings",
            value: data.meetings.length,
            icon: AudioLines,
            note: "All your conversations, captured",
            spark: [12, 22, 15, 29, 22, 39, 36, 50],
          },
          {
            label: "Action items",
            value: all.length,
            icon: ListTodo,
            note: `${all.filter((a) => a.status !== "done").length} still moving forward`,
            spark: [22, 15, 31, 23, 32, 25, 43, 50],
          },
          {
            label: "Completion rate",
            value: `${all.length ? Math.round((done / all.length) * 100) : 0}%`,
            icon: CheckCircle2,
            note: `${done} of ${all.length} actions completed`,
            spark: [13, 17, 16, 22, 29, 28, 39, 46],
          },
          {
            label: "Overdue items",
            value: overdue.length,
            icon: Clock,
            note: overdue.length
              ? "A little attention goes a long way"
              : "You’re right on schedule",
            tone: "amber",
            spark: [40, 31, 36, 27, 26, 17, 21, 12],
          },
        ].map((s) => (
          <div className={`stat-card ${s.tone || ""}`} key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <s.icon size={17} />
            </div>
            <div className="stat-middle">
              <strong>{s.value}</strong>
              <svg className="spark" viewBox="0 0 100 52">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  points={s.spark
                    .map((v, i) => `${i * 14},${52 - v}`)
                    .join(" ")}
                />
              </svg>
            </div>
            <p>{s.note}</p>
          </div>
        ))}
      </div>
      <div className="insight-strip">
        <span className="insight-icon">
          <BrainCircuit size={20} />
        </span>
        <p>
          <strong>Clarity after every conversation.</strong> Your meetings,
          decisions, and next steps — in one place.
        </p>
        <button onClick={() => go("meetings/new")}>
          Capture a meeting <ArrowRight size={15} />
        </button>
      </div>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="section-heading">
            <h2>
              Recent meetings{" "}
              <span className="small-count">{data.meetings.length}</span>
            </h2>
            <button className="text-button" onClick={() => go("meetings")}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="table-labels">
            <span>MEETING</span>
            <span>PARTICIPANTS</span>
            <span>ACTIONS</span>
            <span>STATUS</span>
          </div>
          {data.meetings.slice(0, 5).map((m) => (
            <MeetingRow key={m.id} m={m} />
          ))}
          {!data.meetings.length && (
            <Empty
              title="Your next meeting starts here"
              body="Upload a recording or capture a conversation."
            />
          )}
          <button className="panel-footer" onClick={() => go("meetings/new")}>
            <Plus size={14} />
            Capture another conversation
          </button>
        </section>
        <section className="panel my-actions">
          <div className="section-heading">
            <h2>My action items</h2>
            <button
              className="icon-button"
              aria-label="View my actions"
              onClick={() => go("actions/my")}
            >
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="personal-progress">
            <div>
              <span>Your progress</span>
              <strong>
                {my.filter((a) => a.status === "done").length}{" "}
                <span>/ {my.length} complete</span>
              </strong>
            </div>
            <div className="progress-bar">
              <span
                style={{
                  width: `${my.length ? (my.filter((a) => a.status === "done").length / my.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          {pending.map((a) => (
            <div className="compact-task" key={a.id}>
              <button
                className="checkbox"
                aria-label={"Complete " + a.title}
                onClick={() => updateAction(a.id, { status: "done" })}
              />
              <button
                className="compact-task-text"
                onClick={() => openAction(a.id)}
              >
                <strong>{a.title}</strong>
                <span>
                  <Due action={a} />
                  <span className={`priority-dot ${a.priority}`} />
                  {a.priority}
                </span>
              </button>
            </div>
          ))}
          {!pending.length && (
            <div className="small-empty">
              <CheckCircle2 size={25} />
              All caught up. Nice work.
            </div>
          )}
          <button className="panel-footer" onClick={() => go("actions/my")}>
            View my action items <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="reminders-section">
        <div className="section-heading">
          <h2>Upcoming reminders</h2>
          <span className="subtle">
            <Bell size={13} />
            Stay one step ahead
          </span>
        </div>
        <div className="reminder-grid">
          {upcoming.map((a) => {
            const m = data.members.find((m) => m.id === a.assignedTo);
            return (
              <button
                className={`reminder-card ${isOverdue(a) ? "overdue" : ""}`}
                key={a.id}
                onClick={() => openAction(a.id)}
              >
                <div>
                  <Badge tone={isOverdue(a) ? "amber" : "cyan"}>
                    {isOverdue(a) ? "Overdue" : "Upcoming"}
                  </Badge>
                  <ArrowUpRight size={14} />
                </div>
                <h3>{a.title}</h3>
                <footer>
                  {m ? (
                    <>
                      <Avatar name={m.name} id={m.id} />
                      <span>{m.name.split(" ")[0]}</span>
                    </>
                  ) : (
                    <span>Unassigned</span>
                  )}
                  <span>{date(a.dueDate)}</span>
                </footer>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
