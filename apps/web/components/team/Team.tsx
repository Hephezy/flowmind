"use client";
import type { Member } from "@flowmind/shared";
import {
  Check,
  Crown,
  Mail,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import React, { useState } from "react";
import {
  Avatar,
  Badge,
  date,
  Heading,
  Modal,
  uid,
  useFlow,
} from "../ui/common";

export function Team() {
  const { data, perform, toast, go, demo } = useFlow(),
    [invite, setInvite] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("member"),
    [message, setMessage] = useState(""),
    [remove, setRemove] = useState<Member | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const result = await perform(
      "/team/invites",
      "POST",
      { email, role, message },
      (d) => {
        d.invites = d.invites.filter((i) => i.email !== email);
        const i = {
          id: uid(),
          email,
          role,
          message,
          createdAt: new Date().toISOString(),
        };
        d.invites.push(i);
        return { id: i.id, emailSent: false };
      },
    );
    if (result) {
      setInvite(false);
      toast(
        demo
          ? "Demo invitation saved. No email was sent."
          : result.emailSent
            ? "Invitation sent"
            : `Invitation created. Email delivery is not configured.`,
      );
      if (result.inviteUrl) {
        await navigator.clipboard.writeText(result.inviteUrl).catch(() => {});
        toast("Invitation link copied");
      }
    }
  }
  return (
    <>
      <Heading
        eyebrow="BETTER FOLLOW-THROUGH, TOGETHER"
        title="One team. Shared momentum."
        sub="Bring the right people into every conversation and every next step."
      >
        <button className="primary" onClick={() => setInvite(true)}>
          <Plus size={16} />
          Invite member
        </button>
      </Heading>
      <section className="panel workspace-card">
        <span className="workspace-monogram">M</span>
        <div>
          <h2>{data.workspace.name}</h2>
          <p>{data.workspace.description}</p>
          <div className="workspace-numbers">
            <span>
              <strong>{data.members.length}</strong> members
            </span>
            <span>
              <strong>{data.meetings.length}</strong> meetings
            </span>
            <span>
              <strong>{data.actions.length}</strong> actions
            </span>
          </div>
        </div>
        <button className="secondary" onClick={() => go("settings/workspace")}>
          <Settings size={14} />
          Workspace settings
        </button>
      </section>
      <section className="panel members-panel">
        <div className="section-heading">
          <h2>
            Workspace members{" "}
            <span className="small-count">{data.members.length}</span>
          </h2>
          <Badge tone="green">Everyone has a place</Badge>
        </div>
        <div className="member-head">
          <span>MEMBER</span>
          <span>ROLE</span>
          <span>JOINED</span>
          <span>OPEN ACTIONS</span>
          <span />
        </div>
        {data.members.map((m) => (
          <div className="member-row" key={m.id}>
            <div>
              <Avatar name={m.name} id={m.id} />
              <span>
                <strong>
                  {m.name}
                  {m.id === data.user.id && <small> you</small>}
                </strong>
                <p>{m.email}</p>
              </span>
            </div>
            <span>
              {m.role === "owner" ? (
                <Badge tone="cyan">
                  <Crown size={11} />
                  Owner
                </Badge>
              ) : (
                <select
                  aria-label={"Role of " + m.name}
                  value={m.role}
                  onChange={(e) =>
                    perform(
                      "/team/members/" + m.id,
                      "PATCH",
                      { role: e.target.value },
                      (d) => {
                        d.members.find((x) => x.id === m.id)!.role = e.target
                          .value as Member["role"];
                      },
                    )
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              )}
            </span>
            <span>{date(m.joinedAt)}</span>
            <span>
              {
                data.actions.filter(
                  (a) => a.assignedTo === m.id && a.status !== "done",
                ).length
              }
            </span>
            {m.role !== "owner" && (
              <button
                className="icon-button"
                aria-label={"Remove " + m.name}
                onClick={() => setRemove(m)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {data.invites.map((i) => (
          <div className="member-row invite-row" key={i.id}>
            <div>
              <span className="avatar">
                <Mail size={14} />
              </span>
              <span>
                <strong>{i.email}</strong>
                <p>Waiting to join the workspace</p>
              </span>
            </div>
            <Badge tone="amber">Pending</Badge>
            <span>{date(i.createdAt)}</span>
            <button
              className="text-button"
              onClick={async () => {
                await perform(
                  "/team/invites",
                  "POST",
                  { email: i.email, role: i.role, message: i.message || "" },
                  (d) => {},
                );
                toast(
                  demo ? "Demo only: no email sent." : "Invitation refreshed",
                );
              }}
            >
              Resend
            </button>
            <button
              className="icon-button"
              aria-label={"Cancel invitation to " + i.email}
              onClick={() =>
                perform(
                  "/resources/invites/" + i.id,
                  "DELETE",
                  undefined,
                  (d) => {
                    d.invites = d.invites.filter((x) => x.id !== i.id);
                  },
                )
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </section>
      <div className="section-heading roles-heading">
        <h2>Roles & permissions</h2>
        <span className="subtle">The right access for every teammate</span>
      </div>
      <div className="roles-grid">
        {[
          {
            title: "Owner",
            icon: Crown,
            items: [
              "Full workspace control",
              "Manage billing & subscription",
              "Invite and manage members",
              "Manage all shared meetings",
            ],
          },
          {
            title: "Admin",
            icon: Shield,
            items: [
              "Invite and manage members",
              "Configure integrations",
              "Manage shared meetings",
              "Manage workspace settings",
            ],
          },
          {
            title: "Member",
            icon: User,
            items: [
              "Upload and process meetings",
              "View shared meeting results",
              "Update assigned action items",
              "Manage personal settings",
            ],
          },
        ].map((r) => (
          <div className="panel role-card" key={r.title}>
            <r.icon size={21} />
            <h3>{r.title}</h3>
            {r.items.map((i) => (
              <p key={i}>
                <Check size={13} />
                {i}
              </p>
            ))}
          </div>
        ))}
      </div>
      {invite && (
        <Modal
          title="Invite your next collaborator"
          sub={
            demo
              ? "Demo invitations are saved locally; no emails are sent."
              : "An invitation link will give them access to this workspace."
          }
          onClose={() => setInvite(false)}
        >
          <form onSubmit={send}>
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>
              Personal message <span className="subtle">(optional)</span>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="A little note to welcome them…"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setInvite(false)}
              >
                Cancel
              </button>
              <button className="primary">
                <Send size={14} />
                {demo ? "Save demo invitation" : "Send invitation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title={"Remove " + remove.name + "?"}
          sub="They will lose workspace access. Their action items will become unassigned."
          onClose={() => setRemove(null)}
        >
          <div className="modal-actions">
            <button className="secondary" onClick={() => setRemove(null)}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={async () => {
                await perform(
                  "/team/members/" + remove.id,
                  "PATCH",
                  { remove: true },
                  (d) => {
                    d.members = d.members.filter((m) => m.id !== remove.id);
                    d.actions
                      .filter((a) => a.assignedTo === remove.id)
                      .forEach((a) => (a.assignedTo = null));
                  },
                );
                setRemove(null);
              }}
            >
              Remove member
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
