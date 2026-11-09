"use client";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  Folder,
  Globe,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  Plus,
  Shield,
  Trash2,
  User,
  Webhook,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { download, request } from "../../lib/api";
import {
  Avatar,
  Badge,
  date,
  Empty,
  Heading,
  Modal,
  Toggle,
  uid,
  useFlow,
} from "../ui/common";

import {
  BillingExtras,
  DangerZone,
  LoginHistory,
  ProfileExtras,
} from "./Extras";
export const settingsNav = [
  ["profile", "My profile", User],
  ["notifications", "Notifications", Bell],
  ["security", "Security", Shield],
  ["workspace", "Workspace", Folder],
  ["integrations", "Integrations", LayoutGrid],
  ["billing", "Billing", CreditCard],
  ["api-keys", "API keys", KeyRound],
  ["webhooks", "Webhooks", Webhook],
  ["logs", "Activity logs", Activity],
] as const;

export function SettingsView({ section = "profile" }: { section?: string }) {
  const { data, go } = useFlow();
  return (
    <>
      <Heading
        eyebrow="MAKE FLOWMIND YOURS"
        title="A workspace that works for you."
        sub="Manage your account, team preferences, and connected tools."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          {settingsNav.map(([id, label, Icon], i) => (
            <React.Fragment key={id}>
              {i === 3 && <div className="settings-group">WORKSPACE</div>}
              <button
                className={section === id ? "active" : ""}
                onClick={() => go("settings/" + id)}
              >
                <Icon size={15} />
                {label}
                {section === id && <ChevronRight size={13} />}
              </button>
            </React.Fragment>
          ))}
        </aside>
        <div className="settings-content" key={section}>
          {section === "profile" ? (
            <>
              <ProfileSettings />
              <ProfileExtras />
            </>
          ) : section === "notifications" ? (
            <NotificationSettings />
          ) : section === "security" ? (
            <>
              <SecuritySettings />
              <LoginHistory />
              <DangerZone />
            </>
          ) : section === "workspace" ? (
            <>
              <WorkspaceSettings />
              <DangerZone workspace />
            </>
          ) : section === "integrations" ? (
            <IntegrationSettings />
          ) : section === "billing" ? (
            <>
              <BillingSettings />
              <BillingExtras />
            </>
          ) : section === "api-keys" ? (
            <KeySettings />
          ) : section === "webhooks" ? (
            <WebhookSettings />
          ) : (
            <LogSettings />
          )}
        </div>
      </div>
    </>
  );
}

export function ProfileSettings() {
  const { data, perform, toast, demo } = useFlow();
  const [name, setName] = useState(data.user.name),
    [timezone, setTimezone] = useState(
      data.settings.timezone || data.user.timezone || "Africa/Lagos",
    ),
    [language, setLanguage] = useState(data.settings.language || "en");
  return (
    <section className="panel padded">
      <div className="section-heading">
        <div>
          <h2>My profile</h2>
          <p>Your identity across the workspace.</p>
        </div>
        <Avatar name={name} size="large" />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await perform(
            "/profile",
            "PATCH",
            { name, timezone, settings: { language } },
            (d) => {
              d.user.name = name;
              d.user.timezone = timezone;
              d.members.find((m) => m.id === d.user.id)!.name = name;
              Object.assign(d.settings, { timezone, language });
            },
          );
          if (r !== null) toast("Profile saved");
        }}
      >
        <div className="form-grid">
          <label className="span-2">
            Full name
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="span-2">
            Email address
            <input value={data.user.email} disabled />
            <span className="field-help">
              Your email identifies your account and workspace invitations.
            </span>
          </label>
          <label>
            Timezone
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {[
                "Africa/Lagos",
                "Africa/Accra",
                "Europe/London",
                "Europe/Paris",
                "America/New_York",
                "America/Los_Angeles",
                "Asia/Dubai",
                "Asia/Kolkata",
                "Asia/Singapore",
                "Australia/Sydney",
                "Etc/UTC",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="pt">Portuguese</option>
            </select>
          </label>
        </div>
        <div className="settings-save">
          <button className="primary">
            <Check size={15} />
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}

export function NotificationSettings() {
  const { data, perform, toast } = useFlow();
  const [settings, setSettings] = useState({ ...data.settings });
  const set = (key: string, value: any) =>
    setSettings((s) => ({ ...s, [key]: value }));
  return (
    <section className="panel padded">
      <h2>Notifications</h2>
      <p>The right nudge, at the right time.</p>
      {[
        {
          title: "MEETING NOTIFICATIONS",
          rows: [
            [
              "meetingReady",
              "Meeting ready",
              "When your transcript, summary, and actions are ready.",
            ],
          ],
        },
        {
          title: "ACTION ITEM NOTIFICATIONS",
          rows: [
            [
              "actionAssigned",
              "New assignments",
              "When an action item is assigned to you.",
            ],
            [
              "dueReminder",
              "Due date reminders",
              "A reminder 24 hours and 1 hour before a deadline.",
            ],
            [
              "overdueDigest",
              "Overdue digest",
              "A daily check-in on action items that need attention.",
            ],
          ],
        },
        {
          title: "TEAM NOTIFICATIONS",
          rows: [
            [
              "weeklyDigest",
              "Weekly team summary",
              "A snapshot of meetings and progress every Monday.",
            ],
          ],
        },
        {
          title: "NOTIFICATION CHANNELS",
          rows: [
            ["email", "Email", "Updates delivered to your account email."],
            [
              "teams",
              "Microsoft Teams",
              "Requires a connected team and channel.",
            ],
            [
              "slack",
              "Slack",
              "Requires a connected Slack workspace and channel.",
            ],
            [
              "inApp",
              "In-app",
              "Keep your updates in the notification centre.",
            ],
          ],
        },
      ].map((group) => (
        <div className="notification-group" key={group.title}>
          <div className="eyebrow">{group.title}</div>
          {group.rows.map(([key, title, description]) => (
            <div className="toggle-row" key={key}>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <Toggle
                value={settings[key] !== false && !!settings[key]}
                onChange={(v) => set(key, v)}
              />
            </div>
          ))}
        </div>
      ))}
      <div className="notification-group">
        <div className="eyebrow">QUIET HOURS</div>
        <div className="toggle-row">
          <div>
            <strong>Make space to switch off</strong>
            <p>Hold notifications during your local quiet hours.</p>
          </div>
          <Toggle
            value={!!settings.quietHours}
            onChange={(v) => set("quietHours", v)}
          />
        </div>
        <div className="form-grid">
          <label>
            Start
            <select
              value={settings.quietStart ?? 22}
              onChange={(e) => set("quietStart", +e.target.value)}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            End
            <select
              value={settings.quietEnd ?? 8}
              onChange={(e) => set("quietEnd", +e.target.value)}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="settings-save">
        <button
          className="primary"
          onClick={async () => {
            const r = await perform("/profile", "PATCH", { settings }, (d) => {
              d.settings = settings;
            });
            if (r !== null) toast("Notification preferences saved");
          }}
        >
          <Check size={15} />
          Save preferences
        </button>
      </div>
    </section>
  );
}

export function SecuritySettings() {
  const { data, demo, perform, toast } = useFlow();
  const [backup, setBackup] = useState<string[]>([]);
  const [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [totp, setTotp] = useState<any>(null),
    [code, setCode] = useState(""),
    [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    if (!demo)
      request("/security/sessions")
        .then(setSessions)
        .catch(() => {});
  }, [demo]);
  return (
    <>
      {backup.length > 0 && (
        <Modal
          title="Save your backup codes"
          sub="Each code works once. Keep these somewhere safe before closing this window."
          onClose={() => setBackup([])}
        >
          <div className="secret-value">
            <code>{backup.join(" · ")}</code>
          </div>
          <button
            className="primary full"
            onClick={() =>
              download("flowmind-backup-codes.txt", backup.join("\n"))
            }
          >
            <Download size={14} />
            Download backup codes
          </button>
        </Modal>
      )}
      <section className="panel padded">
        <h2>Security</h2>
        <p>Keep your account and conversations protected.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (demo) {
              toast("Password changes are available in the live app.");
              return;
            }
            const r = await perform("/security/password", "POST", {
              password,
              currentPassword: current,
            });
            if (r !== null) {
              setPassword("");
              setCurrent("");
              toast("Password updated");
            }
          }}
        >
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="field-help">Use at least 12 characters.</span>
          </label>
          {password && (
            <div className="progress-bar">
              <span
                style={{
                  width: Math.min((password.length / 16) * 100, 100) + "%",
                }}
              />
            </div>
          )}
          <button className="secondary" type="submit">
            <Lock size={14} />
            Update password
          </button>
        </form>
        <hr />
        <div className="toggle-row">
          <div>
            <strong>Two-factor authentication</strong>
            <p>Add an authenticator code at sign-in.</p>
          </div>
          <Badge tone={data.settings.totpEnabled ? "green" : "muted"}>
            {data.settings.totpEnabled ? "Enabled" : "Not enabled"}
          </Badge>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            if (demo) {
              toast("Authenticator setup requires a live account.");
              return;
            }
            try {
              if (data.settings.totpEnabled) setTotp({ secret: "" });
              else
                setTotp(
                  await request("/security/totp", "POST", { action: "setup" }),
                );
            } catch (e: any) {
              toast(e.message);
            }
          }}
        >
          <Shield size={14} />
          {data.settings.totpEnabled
            ? "Disable with code"
            : "Set up authenticator"}
        </button>
        {totp && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await perform("/security/totp", "POST", {
                action: data.settings.totpEnabled ? "disable" : "enable",
                code,
              });
              if (r !== null) {
                if (r.backupCodes?.length) setBackup(r.backupCodes);
                setTotp(null);
                toast("Two-factor settings updated");
              }
            }}
          >
            <div className="notice">
              <KeyRound size={16} />
              <span>
                Add this secret to your authenticator:{" "}
                <code>{totp.secret}</code>
              </span>
            </div>
            <label>
              6-digit authenticator code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button className="primary">Verify code</button>
          </form>
        )}
      </section>
      <section className="panel padded">
        <h2>Active sessions</h2>
        <p>Review where your account is signed in.</p>
        {demo ? (
          <div className="session-row">
            <Globe size={21} />
            <div>
              <strong>Browser demo</strong>
              <p>Local preview · no authenticated session</p>
            </div>
            <Badge tone="cyan">Current</Badge>
          </div>
        ) : (
          sessions.map((s) => (
            <div className="session-row" key={s.id}>
              <Globe size={20} />
              <div>
                <strong>{s.userAgent.slice(0, 70)}</strong>
                <p>Signed in {date(s.createdAt)}</p>
              </div>
              <button
                className="text-button"
                onClick={async () => {
                  await request("/security/sessions/" + s.id, "DELETE");
                  setSessions((v) => v.filter((x) => x.id !== s.id));
                  toast("Session revoked");
                }}
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </section>
      <section className="panel padded">
        <h2>Your data</h2>
        <p>Keep a copy of the workspace information you can access.</p>
        <button
          className="secondary"
          onClick={() =>
            download(
              "flowmind-data.json",
              JSON.stringify(data, null, 2),
              "application/json",
            )
          }
        >
          <Download size={15} />
          Export my data
        </button>
      </section>
    </>
  );
}

export function WorkspaceSettings() {
  const { data, perform, toast } = useFlow();
  const defaults = data.settings.workspaceDefaults || {};
  const [name, setName] = useState(data.workspace.name),
    [description, setDescription] = useState(data.workspace.description),
    [language, setLanguage] = useState(defaults.defaultLanguage || "en"),
    [confidence, setConfidence] = useState(defaults.confidenceThreshold ?? 0.7),
    [speakers, setSpeakers] = useState(defaults.maxSpeakers || 10),
    [days, setDays] = useState(defaults.actionDueDays || 7);
  return (
    <section className="panel padded">
      <h2>Workspace settings</h2>
      <p>A consistent starting point for every meeting.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const body = {
            name,
            description,
            defaultLanguage: language,
            confidenceThreshold: confidence,
            maxSpeakers: speakers,
            actionDueDays: days,
          };
          const r = await perform("/workspace", "PATCH", body, (d) => {
            d.workspace.name = name;
            d.workspace.description = description;
            d.settings.workspaceDefaults = body;
          });
          if (r !== null) toast("Workspace settings saved");
        }}
      >
        <label>
          Workspace name
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Workspace URL
          <input value={"flowmind / " + data.workspace.slug} disabled />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <hr />
        <div className="eyebrow">MEETING DEFAULTS</div>
        <div className="form-grid">
          <label>
            Transcription language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="auto">Auto detect</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
          </label>
          <label>
            Default due date (days)
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(+e.target.value)}
            />
          </label>
          <label>
            Max speakers
            <input
              type="number"
              min={1}
              max={50}
              value={speakers}
              onChange={(e) => setSpeakers(+e.target.value)}
            />
          </label>
          <label>
            Action confidence threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(+e.target.value)}
            />
          </label>
        </div>
        <p className="field-help">
          Only actions above the threshold are included. A default deadline is
          applied when no deadline is mentioned.
        </p>
        <div className="settings-save">
          <button className="primary">
            <Check size={15} />
            Save workspace
          </button>
        </div>
      </form>
    </section>
  );
}

export const integrationList = [
  {
    id: "google",
    name: "Google Calendar",
    desc: "Browse Meet recordings in Google Drive.",
    symbol: "G",
    colour: "google",
  },
  {
    id: "zoom",
    name: "Zoom",
    desc: "Bring cloud recordings into your workspace.",
    symbol: "Z",
    colour: "zoom",
  },
  {
    id: "slack",
    name: "Slack",
    desc: "Send summaries and timely team reminders.",
    symbol: "#",
    colour: "slack",
  },
  {
    id: "notion",
    name: "Notion",
    desc: "Turn meeting summaries into shared pages.",
    symbol: "N",
    colour: "notion",
  },
  {
    id: "linear",
    name: "Linear",
    desc: "Move meeting actions into your issue tracker.",
    symbol: "L",
    colour: "linear",
  },
  {
    id: "asana",
    name: "Asana",
    desc: "Create tasks in your project workflow.",
    symbol: "A",
    colour: "asana",
  },
  {
    id: "jira",
    name: "Jira",
    desc: "Keep sprint commitments connected.",
    symbol: "J",
    colour: "jira",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    desc: "Import recordings from Microsoft OneDrive.",
    symbol: "T",
    colour: "teams",
  },
  {
    id: "zapier",
    name: "Zapier",
    desc: "Connect workflows through signed webhooks.",
    symbol: "*",
    colour: "zapier",
  },
];

export function IntegrationSettings() {
  const { data, demo, perform, toast, go } = useFlow();
  const [selected, setSelected] = useState<string | null>(null),
    [token, setTokenValue] = useState(""),
    [configuration, setConfiguration] = useState("{}");
  const connect = async (id: string) => {
    if (id === "zapier") {
      go("settings/webhooks");
      return;
    }
    if (demo) {
      setSelected(id);
      toast("Preview configuration. Connections require the live API.");
      return;
    }
    try {
      const r = await request("/integrations/" + id + "/authorize", "POST");
      window.location.href = r.url;
    } catch (e: any) {
      setSelected(id);
      toast(e.message);
    }
  };
  return (
    <>
      <section className="panel padded">
        <h2>Your tools, connected.</h2>
        <p>
          Keep the context in FlowMind and the work where your team already
          works.
        </p>
        <div className="notice">
          <Info size={15} />
          {demo
            ? "This demo has no connected external accounts. Configure the live API to enable integrations."
            : "OAuth requires provider credentials configured on the server. Tokens are encrypted at rest."}
        </div>
      </section>
      <div className="integration-grid">
        {integrationList.map((i) => {
          const connected = data.integrations.find((x) => x.provider === i.id);
          return (
            <div className="panel integration-card" key={i.id}>
              <div>
                <span className={"integration-symbol " + i.colour}>
                  {i.symbol}
                </span>
                {connected && <Badge tone="green">Connected</Badge>}
              </div>
              <h3>{i.name}</h3>
              <p>{i.desc}</p>
              <button
                className="secondary full"
                onClick={() => (connected ? setSelected(i.id) : connect(i.id))}
              >
                {connected ? "Configure" : "Connect"}
                <ArrowUpRight size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {selected && (
        <Modal
          title={
            "Configure " + integrationList.find((i) => i.id === selected)?.name
          }
          sub={
            demo
              ? "Preview only. No credential will be stored in demo mode."
              : "Use OAuth or enter a provider access token with the required scopes."
          }
          onClose={() => setSelected(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (demo) {
                toast("Configuration preview only. No account was connected.");
                setSelected(null);
                return;
              }
              try {
                const settings = JSON.parse(configuration);
                const r = await perform("/integrations/" + selected, "PATCH", {
                  ...(token ? { accessToken: token } : {}),
                  settings,
                });
                if (r !== null) {
                  setSelected(null);
                  setTokenValue("");
                  toast("Integration configured");
                }
              } catch {
                toast("Enter valid settings JSON.");
              }
            }}
          >
            <label>
              Access token
              <input
                type="password"
                value={token}
                onChange={(e) => setTokenValue(e.target.value)}
                autoComplete="off"
                placeholder="Provider access token"
              />
            </label>
            <label>
              Provider settings (JSON)
              <textarea
                className="code-input"
                rows={6}
                value={configuration}
                onChange={(e) => setConfiguration(e.target.value)}
              />
              <span className="field-help">
                Automatic import: autoImport, autoImportSince · Slack: channel ·
                Linear: teamId · Asana: projectId · Jira: cloudId, projectKey ·
                Notion: parentPageId
              </span>
            </label>
            <div className="modal-actions">
              {data.integrations.some((i) => i.provider === selected) && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    await perform(
                      "/resources/integrations/" + selected,
                      "DELETE",
                      undefined,
                      (d) => {
                        d.integrations = d.integrations.filter(
                          (i) => i.provider !== selected,
                        );
                      },
                    );
                    setSelected(null);
                  }}
                >
                  Disconnect
                </button>
              )}
              <button className="primary">Save configuration</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function BillingSettings() {
  const { data, demo, toast } = useFlow();
  async function checkout(plan: string) {
    if (demo) {
      toast(
        "Live billing requires Stripe credentials. No payment is taken in this demo.",
      );
      return;
    }
    try {
      const b = await request("/billing/checkout", "POST", { plan });
      window.location.href = b.url;
    } catch (e: any) {
      toast(e.message);
    }
  }
  return (
    <>
      <section className="panel padded">
        <div className="section-heading">
          <div>
            <h2>Your plan</h2>
            <p>Room to grow as your conversations do.</p>
          </div>
          <Badge tone="cyan">{data.workspace.plan}</Badge>
        </div>
        <div className="plan-current">
          <strong>
            {data.workspace.plan === "starter"
              ? "$0"
              : data.workspace.plan === "team"
                ? "$49"
                : "$15"}
            <span>/ month</span>
          </strong>
          <p>{data.workspace.name} · Current workspace plan</p>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            if (demo) {
              toast("Billing management is available after connecting Stripe.");
              return;
            }
            try {
              const b = await request("/billing/portal", "POST");
              window.location.href = b.url;
            } catch (e: any) {
              toast(e.message);
            }
          }}
        >
          <CreditCard size={14} />
          Manage subscription
        </button>
      </section>
      <div className="pricing-grid">
        {[
          {
            name: "Pro",
            price: 15,
            features: [
              "More room for meeting recordings",
              "AI summaries & action extraction",
              "Connected productivity tools",
            ],
          },
          {
            name: "Team",
            price: 49,
            features: [
              "Shared team workflows",
              "Role-based workspace access",
              "Team analytics & reminders",
            ],
          },
        ].map((p) => (
          <section className="panel pricing-card" key={p.name}>
            <h3>{p.name}</h3>
            <div className="plan-price">
              ${p.price}
              <span>/month</span>
            </div>
            {p.features.map((f) => (
              <p key={f}>
                <Check size={13} />
                {f}
              </p>
            ))}
            <button
              className="primary full"
              onClick={() => checkout(p.name.toLowerCase())}
            >
              Choose {p.name}
              <ArrowRight size={14} />
            </button>
          </section>
        ))}
      </div>
      <section className="panel padded">
        <h2>Workspace usage</h2>
        <div className="usage-row">
          <span>Meetings processed</span>
          <strong>
            {data.meetings.filter((m) => m.status === "completed").length}
          </strong>
        </div>
        <div className="usage-row">
          <span>Actions captured</span>
          <strong>{data.actions.length}</strong>
        </div>
        <div className="usage-row">
          <span>Team members</span>
          <strong>{data.members.length}</strong>
        </div>
        <hr />
        <h3>Payment history</h3>
        <p>
          No payment records in this workspace preview. Live invoices are
          available in the billing portal.
        </p>
      </section>
    </>
  );
}

export function KeySettings() {
  const { data, perform, toast, demo } = useFlow();
  const [modal, setModal] = useState(false),
    [name, setName] = useState(""),
    [permissions, setPermissions] = useState(["meetings:read", "actions:read"]),
    [secret, setSecret] = useState("");
  return (
    <>
      <section className="panel padded">
        <div className="section-heading">
          <div>
            <h2>API keys</h2>
            <p>Connect your own tools to the FlowMind API.</p>
          </div>
          <button className="primary" onClick={() => setModal(true)}>
            <Plus size={14} />
            Create key
          </button>
        </div>
        <div className="notice amber">
          <KeyRound size={16} />
          <span>
            Keys are shown once. Store them securely and grant only the
            permissions your integration needs.
          </span>
        </div>
        {data.keys.length ? (
          data.keys.map((k) => (
            <div className="key-row" key={k.id}>
              <div>
                <strong>{k.name}</strong>
                <p>
                  <code>{k.prefix}••••••••••••</code> · Created{" "}
                  {date(k.createdAt)}
                </p>
                <div className="topic-tags">
                  {k.permissions.map((p: string) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
              </div>
              <button
                className="icon-button"
                aria-label={"Revoke " + k.name}
                onClick={() =>
                  perform(
                    "/resources/keys/" + k.id,
                    "DELETE",
                    undefined,
                    (d) => {
                      d.keys = d.keys.filter((x) => x.id !== k.id);
                    },
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          <Empty
            title="No API keys yet"
            body="Create a scoped key when you’re ready to build an integration."
          />
        )}
      </section>
      {modal && (
        <Modal
          title="Create API key"
          sub={
            demo
              ? "Demo keys illustrate the workflow and do not authorize an API."
              : "Choose a name and the minimum required permissions."
          }
          onClose={() => setModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!permissions.length) {
                toast("Choose at least one permission.");
                return;
              }
              const r = await perform(
                "/keys",
                "POST",
                { name, permissions },
                (d) => {
                  const value = "fm_demo_" + uid().replaceAll("-", "");
                  const k = {
                    id: uid(),
                    name,
                    permissions,
                    prefix: value.slice(0, 12),
                    createdAt: new Date().toISOString(),
                  };
                  d.keys.push(k);
                  return { value };
                },
              );
              if (r) {
                setModal(false);
                setSecret(r.value);
                setName("");
              }
            }}
          >
            <label>
              Key name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Reporting integration"
              />
            </label>
            <div className="permissions-grid">
              {[
                "meetings:read",
                "meetings:write",
                "actions:read",
                "actions:write",
                "webhooks:read",
                "webhooks:write",
              ].map((p) => (
                <label className="check-label" key={p}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={(e) =>
                      setPermissions(
                        e.target.checked
                          ? [...permissions, p]
                          : permissions.filter((x) => x !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="primary">
                <KeyRound size={14} />
                Generate key
              </button>
            </div>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal
          title="Your key is ready"
          sub="Copy it now. It will not be displayed again."
          onClose={() => setSecret("")}
        >
          <div className="secret-value">
            <code>{secret}</code>
          </div>
          <button
            className="primary full"
            onClick={async () => {
              await navigator.clipboard.writeText(secret).catch(() => {});
              toast("Key copied");
            }}
          >
            <Copy size={14} />
            Copy key
          </button>
        </Modal>
      )}
    </>
  );
}

export function WebhookSettings() {
  const { data, perform, toast, demo } = useFlow();
  const [modal, setModal] = useState(false),
    [url, setUrl] = useState(""),
    [events, setEvents] = useState(["meeting.completed"]),
    [secret, setSecret] = useState(""),
    [payload, setPayload] = useState<any>(null);
  return (
    <section className="panel padded">
      <div className="section-heading">
        <div>
          <h2>Webhooks</h2>
          <p>Send signed events to your workflows, including Zapier.</p>
        </div>
        <button className="primary" onClick={() => setModal(true)}>
          <Plus size={14} />
          Add webhook
        </button>
      </div>
      <div className="notice">
        <Webhook size={16} />
        <span>
          Deliveries use HMAC-SHA256 signatures and retry independently. Live
          destination hosts must be allowed by the API server.
        </span>
      </div>
      {data.webhooks.length ? (
        data.webhooks.map((w) => (
          <div className="webhook-card" key={w.id}>
            <div>
              <span className="integration-symbol">
                <Webhook size={20} />
              </span>
              <div>
                <strong>{w.url}</strong>
                <div className="topic-tags">
                  {w.events.map((e: string) => (
                    <Badge tone="cyan" key={e}>
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Remove webhook"
                onClick={() =>
                  perform(
                    "/resources/webhooks/" + w.id,
                    "DELETE",
                    undefined,
                    (d) => {
                      d.webhooks = d.webhooks.filter((x) => x.id !== w.id);
                    },
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <footer>
              <span>{w.successCount || 0} successful</span>
              <span>{w.failureCount || 0} failed</span>
              <Badge tone="green">
                {demo ? "Demo configuration" : "Active"}
              </Badge>
            </footer>
            {w.deliveries?.map((delivery: any) => (
              <button
                key={delivery.id}
                className="delivery-row"
                onClick={() => setPayload(delivery)}
              >
                {delivery.event}
                <Badge tone={delivery.status < 300 ? "green" : "red"}>
                  {delivery.status}
                </Badge>
                {date(delivery.createdAt)}
                <Eye size={14} />
              </button>
            ))}
          </div>
        ))
      ) : (
        <Empty
          title="Ready when your workflow is"
          body="Add a webhook to receive meeting and action events."
        />
      )}
      {modal && (
        <Modal
          title="Add a webhook"
          sub={
            demo
              ? "Demo destinations are saved locally; no events are sent."
              : "Your endpoint must accept HTTPS JSON POST requests."
          }
          onClose={() => setModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await perform(
                "/webhooks",
                "POST",
                { url, events },
                (d) => {
                  d.webhooks.push({
                    id: uid(),
                    url,
                    events,
                    isActive: true,
                    successCount: 0,
                    failureCount: 0,
                    createdAt: new Date().toISOString(),
                  });
                  return { secret: "demo_" + uid() };
                },
              );
              if (r) {
                setModal(false);
                setSecret(r.secret);
              }
            }}
          >
            <label>
              Endpoint URL
              <input
                type="url"
                required
                pattern="https://.*"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.com/hooks/flowmind"
              />
            </label>
            {["meeting.completed", "action.completed"].map((e) => (
              <label className="check-label" key={e}>
                <input
                  type="checkbox"
                  checked={events.includes(e)}
                  onChange={(v) =>
                    setEvents(
                      v.target.checked
                        ? [...events, e]
                        : events.filter((x) => x !== e),
                    )
                  }
                />
                {e}
              </label>
            ))}
            <div className="modal-actions">
              <button className="primary" disabled={!events.length}>
                Create webhook
              </button>
            </div>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal
          title="Webhook signing secret"
          sub="Use this secret to verify X-FlowMind-Signature. Copy it now."
          onClose={() => setSecret("")}
        >
          <div className="secret-value">
            <code>{secret}</code>
          </div>
          <button
            className="primary full"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              toast("Signing secret copied");
            }}
          >
            <Copy size={14} />
            Copy secret
          </button>
        </Modal>
      )}
      {payload && (
        <Modal title="Webhook delivery" onClose={() => setPayload(null)}>
          <pre className="json-view">{JSON.stringify(payload, null, 2)}</pre>
        </Modal>
      )}
    </section>
  );
}

export function LogSettings() {
  const { data } = useFlow();
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<any>(null);
  return (
    <section className="panel padded">
      <div className="section-heading">
        <div>
          <h2>Activity & audit logs</h2>
          <p>A clear record of what happened in your workspace.</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All events</option>
          <option value="meeting">Meetings</option>
          <option value="action">Actions</option>
          <option value="team">Team</option>
          <option value="security">Security</option>
        </select>
      </div>
      {data.logs
        .filter((l) => filter === "all" || l.event.startsWith(filter))
        .map((l) => (
          <button className="log-row" key={l.id} onClick={() => setSelected(l)}>
            <span className="log-icon">
              <Activity size={16} />
            </span>
            <div>
              <strong>
                {l.event.replaceAll(".", " · ").replaceAll("_", " ")}
              </strong>
              <p>
                {data.members.find((m) => m.id === l.actorId)?.name || "System"}{" "}
                · {date(l.createdAt)}
              </p>
            </div>
            <Badge
              tone={
                l.event.startsWith("meeting")
                  ? "cyan"
                  : l.event.startsWith("action")
                    ? "green"
                    : "muted"
              }
            >
              {l.event.split(".")[0]}
            </Badge>
            <ChevronRight size={14} />
          </button>
        ))}
      {!data.logs.length && (
        <Empty
          title="A fresh start"
          body="Workspace activity will appear here."
        />
      )}
      {selected && (
        <Modal
          title={selected.event}
          sub={new Date(selected.createdAt).toLocaleString()}
          onClose={() => setSelected(null)}
        >
          <pre className="json-view">
            {JSON.stringify(selected.details, null, 2)}
          </pre>
        </Modal>
      )}
    </section>
  );
}
