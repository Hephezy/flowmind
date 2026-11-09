"use client";
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "../../lib/api";
import { Modal, date, useFlow } from "../ui/common";
export function ProfileExtras() {
  const { data, demo, perform, toast } = useFlow();
  return (
    <section className="panel padded">
      <h2>Profile photo & email</h2>
      <p>Your profile photo is shared across your workspace.</p>
      {data.settings.avatarUrl && (
        <img
          src={data.settings.avatarUrl}
          className="avatar large"
          alt="Your profile photo"
        />
      )}
      <label>
        Upload a photo
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1024 ** 2) {
              toast("Choose a photo smaller than 1MB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
              await perform(
                "/profile",
                "PATCH",
                { avatarUrl: reader.result },
                (d) => {
                  d.settings.avatarUrl = reader.result;
                },
              );
              toast("Profile photo updated");
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>
      <div className="toggle-row">
        <div>
          <strong>Email verification</strong>
          <p>
            {data.settings.emailVerified
              ? "Your email address is verified."
              : "Verify your email address to confirm your account identity."}
          </p>
        </div>
        {data.settings.emailVerified ? (
          <CheckCircle2 size={20} className="green-text" />
        ) : (
          <button
            className="secondary"
            onClick={async () => {
              if (demo) {
                toast("Email verification is available in the live app.");
                return;
              }
              const r = await perform("/security/verify-email", "POST", {});
              if (r !== null) toast("Verification email sent");
            }}
          >
            <Mail size={14} />
            Send verification
          </button>
        )}
      </div>
    </section>
  );
}
export function DangerZone({ workspace = false }: { workspace?: boolean }) {
  const { data, demo, perform, toast, go } = useFlow();
  const [modal, setModal] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [password, setPassword] = useState("");
  return (
    <section className="panel padded" style={{ borderColor: "#583437" }}>
      <h2>{workspace ? "Delete workspace" : "Delete account"}</h2>
      <p>
        {workspace
          ? "Permanently remove this workspace, its meetings, recordings, actions, and memberships."
          : "Permanently remove your account and every workspace you own. This also removes their recordings."}
      </p>
      <button className="danger" onClick={() => setModal(true)}>
        <Trash2 size={14} />
        {workspace ? "Delete workspace" : "Delete my account"}
      </button>
      {modal && (
        <Modal
          title={workspace ? "Delete this workspace?" : "Delete your account?"}
          sub="This cannot be undone. Confirm your identity and the exact name below."
          onClose={() => setModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (demo) {
                toast(
                  "Deletion is available in the live app. Use Reset demo to restore sample data.",
                );
                setModal(false);
                return;
              }
              const result = await perform(
                workspace ? "/workspace/delete" : "/account/delete",
                "POST",
                { confirmation, password },
              );
              if (result !== null) {
                setModal(false);
                go("login");
                toast(workspace ? "Workspace deleted" : "Account deleted");
              }
            }}
          >
            <label>
              {workspace
                ? "Type " + data.workspace.name
                : "Type " + data.user.email}
              <input
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <label>
              Current password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setModal(false)}
              >
                Cancel
              </button>
              <button
                className="danger"
                disabled={
                  confirmation !==
                  (workspace ? data.workspace.name : data.user.email)
                }
              >
                Permanently delete
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function LoginHistory() {
  const { data } = useFlow();
  const events = data.logs.filter(
    (l) => l.event === "security.login" && l.actorId === data.user.id,
  );
  return (
    <section className="panel padded">
      <h2>Login history</h2>
      <p>Recent sign-ins to this workspace.</p>
      {events.length ? (
        events.map((e) => (
          <div className="session-row" key={e.id}>
            <Clock size={17} />
            <div>
              <strong>
                {date(e.createdAt, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                })}
              </strong>
              <p>{e.details?.userAgent || "Unknown device"}</p>
            </div>
          </div>
        ))
      ) : (
        <p>No recorded sign-ins in this preview.</p>
      )}
    </section>
  );
}
export function BillingExtras() {
  const { data, demo, toast } = useFlow();
  const [invoices, setInvoices] = useState<any[]>([]),
    [referral, setReferral] = useState("");
  useEffect(() => {
    setReferral(
      `${window.location.origin}/?ref=${encodeURIComponent(data.workspace.id)}#signup`,
    );
    if (!demo)
      request("/billing/invoices")
        .then((r) => setInvoices(r.data || []))
        .catch(() => {});
  }, [demo, data.workspace.id]);
  return (
    <>
      <section className="panel padded">
        <h2>Billing history</h2>
        <p>Your subscription invoices and receipts.</p>
        {invoices.length ? (
          invoices.map((i) => (
            <div className="session-row" key={i.id}>
              <div>
                <strong>{i.number || i.id}</strong>
                <p>
                  {date(new Date(i.created * 1000).toISOString())} · {i.status}{" "}
                  · {(i.total / 100).toFixed(2)}{" "}
                  {String(i.currency).toUpperCase()}
                </p>
              </div>
              <a
                className="text-button"
                href={i.hosted_invoice_url}
                target="_blank"
                rel="noreferrer"
              >
                View invoice <ExternalLink size={13} />
              </a>
            </div>
          ))
        ) : (
          <p>No invoices available.</p>
        )}
      </section>
      <section className="panel padded">
        <h2>Invite another team to find their flow</h2>
        <p>
          Share your workspace’s referral link. New workspace signups record
          this referral; reward rules are managed by your business.
        </p>
        <div className="secret-value">
          <code>{referral}</code>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(referral).catch(() => {});
            toast("Referral link copied");
          }}
        >
          <Copy size={14} />
          Copy referral link
        </button>
      </section>
    </>
  );
}
