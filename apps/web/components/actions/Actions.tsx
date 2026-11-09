"use client";
import type { Action } from "@flowmind/shared";
import { isOverdue } from "@flowmind/shared";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  ListTodo,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { download, request } from "../../lib/api";
import {
  Avatar,
  Badge,
  date,
  Due,
  Heading,
  stamp,
  uid,
  useFlow,
} from "../ui/common";

export function Actions() {
  const { data, route, openAction, updateAction, newAction } = useFlow();
  const [view, setView] = useState("board"),
    [filter, setFilter] = useState(
      route.endsWith("/my") ? "Assigned to me" : "All",
    ),
    [assignee, setAssignee] = useState("all"),
    [priority, setPriority] = useState("all"),
    [meeting, setMeeting] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [sort, setSort] = useState("due");
  const all = data.actions,
    overdue = all.filter((a) => isOverdue(a));
  const filtered = all
    .filter(
      (a) =>
        filter === "All" ||
        (filter === "Assigned to me" && a.assignedTo === data.user.id) ||
        (filter === "Unassigned" && !a.assignedTo) ||
        (filter === "Overdue" && isOverdue(a)) ||
        (filter === "Completed" && a.status === "done"),
    )
    .filter((a) => assignee === "all" || a.assignedTo === assignee)
    .filter((a) => priority === "all" || a.priority === priority)
    .filter((a) => meeting === "all" || a.meetingId === meeting)
    .filter((a) => a.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "priority"
          ? ["high", "medium", "low"].indexOf(a.priority) -
            ["high", "medium", "low"].indexOf(b.priority)
          : Date.parse(a.dueDate || "9999") - Date.parse(b.dueDate || "9999"),
    );
  return (
    <>
      <Heading
        eyebrow="MAKE THE NEXT STEP HAPPEN"
        title="Small actions. Real progress."
        sub="A shared view of who’s doing what, and what comes next."
      >
        <button className="secondary" onClick={newAction}>
          <Plus size={16} />
          Add manual item
        </button>
      </Heading>
      {overdue.length > 0 && (
        <div className="overdue-banner">
          <AlertCircle size={17} />
          <span>
            <strong>{overdue.length} action items are overdue.</strong> A quick
            check-in can get things moving.
          </span>
          <button onClick={() => setFilter("Overdue")}>
            View overdue <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="toolbar action-toolbar">
        <div className="segmented">
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={14} />
            Board
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={15} />
            List
          </button>
        </div>
        <div className="search-input">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions…"
            aria-label="Search actions"
          />
        </div>
        <select
          aria-label="Filter by assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="all">All assignees</option>
          {data.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="all">All priorities</option>
          {["high", "medium", "low"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by meeting"
          value={meeting}
          onChange={(e) => setMeeting(e.target.value)}
        >
          <option value="all">All meetings</option>
          {data.meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-pills">
        {["All", "Assigned to me", "Unassigned", "Overdue", "Completed"].map(
          (f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === "Overdue" && (
                <span className="late">{overdue.length}</span>
              )}
            </button>
          ),
        )}
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <button
            onClick={async () => {
              for (const id of selected)
                await updateAction(id, { status: "done" });
              setSelected([]);
            }}
          >
            <Check size={14} />
            Mark complete
          </button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {view === "board" ? (
        <div className="kanban">
          {[
            ["todo", "To do", "muted"],
            ["in_progress", "In progress", "cyan"],
            ["done", "Done", "green"],
          ].map(([status, title, tone]) => (
            <section
              className={`kanban-column ${tone}`}
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (data.actions.some((a) => a.id === id))
                  updateAction(id, { status: status as Action["status"] });
              }}
            >
              <div className="kanban-heading">
                <h3>
                  <span className="status-dot" />
                  {title}
                  <span>
                    {filtered.filter((a) => a.status === status).length}
                  </span>
                </h3>
                <button
                  className="icon-button"
                  aria-label={"Add " + title + " action"}
                  onClick={newAction}
                >
                  <Plus size={15} />
                </button>
              </div>
              {filtered
                .filter((a) => a.status === status)
                .map((a) => {
                  const member = data.members.find(
                      (m) => m.id === a.assignedTo,
                    ),
                    m = data.meetings.find((m) => m.id === a.meetingId);
                  return (
                    <button
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", a.id)
                      }
                      className={`kanban-card ${a.status === "done" ? "done" : ""}`}
                      key={a.id}
                      onClick={() => openAction(a.id)}
                    >
                      <div className="kanban-card-top">
                        <Badge
                          tone={
                            a.priority === "high"
                              ? "red"
                              : a.priority === "medium"
                                ? "amber"
                                : "muted"
                          }
                        >
                          <span className={`priority-dot ${a.priority}`} />
                          {a.priority}
                        </Badge>
                        <MoreHorizontal size={15} />
                      </div>
                      <h3>{a.title}</h3>
                      <span className="source-tag">
                        <AudioLines size={11} />
                        {m?.title || "Manual action"}
                      </span>
                      <footer>
                        {member ? (
                          <Avatar name={member.name} id={member.id} />
                        ) : (
                          <span className="unassigned-avatar">
                            <User size={12} />
                          </span>
                        )}
                        <Due action={a} />
                        {a.status === "done" && (
                          <CheckCircle2 size={14} className="green-text" />
                        )}
                      </footer>
                    </button>
                  );
                })}
              <button className="add-card" onClick={newAction}>
                <Plus size={13} />
                Add action
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel action-table">
          <div className="list-controls">
            <span>{filtered.length} action items</span>
            <label>
              Sort by{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="due">Due date</option>
                <option value="title">Title</option>
                <option value="priority">Priority</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={() =>
                download(
                  "flowmind-actions.csv",
                  "Title,Status,Priority,Assignee,Due date\n" +
                    filtered
                      .map((a) =>
                        [
                          a.title,
                          a.status,
                          a.priority,
                          data.members.find((m) => m.id === a.assignedTo)
                            ?.name || "",
                          a.dueDate || "",
                        ]
                          .map((v) => '"' + v.replace(/"/g, '""') + '"')
                          .join(","),
                      )
                      .join("\n"),
                  "text/csv",
                )
              }
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
          <div className="action-list-head">
            <span />
            <span>ACTION ITEM</span>
            <span>ASSIGNEE</span>
            <span>PRIORITY</span>
            <span>DUE DATE</span>
            <span>STATUS</span>
          </div>
          {filtered.map((a) => (
            <div className="action-list-row" key={a.id}>
              <input
                type="checkbox"
                aria-label={"Select " + a.title}
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              <button onClick={() => openAction(a.id)}>{a.title}</button>
              <span>
                {data.members
                  .find((m) => m.id === a.assignedTo)
                  ?.name.split(" ")[0] || "Unassigned"}
              </span>
              <Badge tone={a.priority === "high" ? "red" : "muted"}>
                {a.priority}
              </Badge>
              <Due action={a} />
              <select
                aria-label={"Status of " + a.title}
                value={a.status}
                onChange={(e) =>
                  updateAction(a.id, {
                    status: e.target.value as Action["status"],
                  })
                }
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ActionEditor({
  id,
  onClose,
}: {
  id?: string;
  onClose: () => void;
}) {
  const { data, updateAction, perform, go, toast, demo } = useFlow();
  const a = data.actions.find((a) => a.id === id);
  const [draft, setDraft] = useState<any>(
    a
      ? { ...a, dueDate: a.dueDate?.slice(0, 10) || "" }
      : {
          title: "",
          description: "",
          assignedTo: data.user.id,
          priority: "medium",
          status: "todo",
          dueDate: "",
          meetingId: null,
          notes: "",
        },
  );
  const [exportProvider, setExport] = useState("linear");
  const update = (key: string, value: any) =>
    setDraft((d: any) => ({ ...d, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title: draft.title,
      description: draft.description,
      assignedTo: draft.assignedTo || null,
      priority: draft.priority,
      status: draft.status,
      dueDate: draft.dueDate
        ? new Date(draft.dueDate + "T17:00:00").toISOString()
        : null,
      meetingId: draft.meetingId || null,
      notes: draft.notes,
    };
    const result = id
      ? await updateAction(id, body)
      : await perform("/actions", "POST", body, (d) => {
          const action: Action = {
            ...body,
            id: uid(),
            sourceQuote: "",
            sourceTimestampSec: 0,
            confidence: 1,
            createdAt: new Date().toISOString(),
            activity: [
              { text: "Created manually", date: new Date().toISOString() },
            ],
          };
          d.actions.unshift(action);
          return action;
        });
    if (result !== null) {
      toast(id ? "Action updated" : "Action created");
      onClose();
    }
  }
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="action-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={id ? "Action details" : "New action item"}
      >
        <div className="drawer-header">
          <span>
            <ListTodo size={17} />
            {id ? "ACTION DETAILS" : "NEW ACTION ITEM"}
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close action details"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={save}>
          <label className="task-title-label">
            Action item
            <textarea
              required
              rows={3}
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What needs to happen?"
              maxLength={500}
            />
          </label>
          <div className="drawer-fields">
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={draft.priority}
                onChange={(e) => update("priority", e.target.value)}
              >
                {["low", "medium", "high"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                value={draft.assignedTo || ""}
                onChange={(e) => update("assignedTo", e.target.value)}
              >
                <option value="">Unassigned</option>
                {data.members.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </label>
            <label>
              Meeting
              <select
                value={draft.meetingId || ""}
                onChange={(e) => update("meetingId", e.target.value)}
              >
                <option value="">Manual action</option>
                {data.meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Add details or acceptance criteria…"
            />
          </label>
          {a?.sourceQuote && (
            <div className="source-quote">
              <div className="eyebrow">FROM THE CONVERSATION</div>
              <blockquote>“{a.sourceQuote}”</blockquote>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onClose();
                  go(
                    `meetings/${a.meetingId}/transcript/${a.sourceTimestampSec}`,
                  );
                }}
              >
                <Play size={12} />
                Jump to {stamp(a.sourceTimestampSec)}
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
          <label>
            Notes
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Keep a note for yourself or your team…"
            />
          </label>
          {a && (
            <div className="activity-log">
              <div className="eyebrow">ACTIVITY</div>
              {a.activity?.map((v, i) => (
                <div key={i}>
                  <span className="status-dot" />
                  <p>
                    {v.text}
                    <small>{date(v.date)}</small>
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="drawer-save">
            <button className="secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              <Check size={15} />
              {id ? "Save changes" : "Create action"}
            </button>
          </div>
        </form>
        {a && (
          <div className="export-task">
            <select
              value={exportProvider}
              onChange={(e) => setExport(e.target.value)}
            >
              <option value="linear">Linear</option>
              <option value="asana">Asana</option>
              <option value="jira">Jira</option>
            </select>
            <button
              className="secondary"
              onClick={async () => {
                if (demo) {
                  toast(
                    "Connect " +
                      exportProvider +
                      " in the live app to create a task.",
                  );
                  return;
                }
                try {
                  await request("/integrations/export-action", "POST", {
                    actionId: a.id,
                    provider: exportProvider,
                  });
                  toast("Task exported");
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              <ArrowUpRight size={13} />
              Export task
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
