"use client";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  BrainCircuit,
  Check,
  CheckSquare,
  Info,
  ListTodo,
  Loader2,
  Play,
} from "lucide-react";
import { useState } from "react";
import { request, setToken } from "../../lib/api";
import { Avatar, Badge, Logo, Modal, useFlow } from "../ui/common";

export function AuthPage({
  signup = false,
  onSignedIn,
}: {
  signup?: boolean;
  onSignedIn: () => void;
}) {
  const { go, demo, toast } = useFlow();
  const [forgot, setForgot] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <button onClick={() => go("welcome")} className="brand-button">
        <Logo />
      </button>
      <div className="auth-card panel">
        <div className="eyebrow">CLARITY STARTS HERE</div>
        <h1>{signup ? "Make room for better meetings." : "Welcome back."}</h1>
        <p>
          {signup
            ? "Create your workspace and turn conversations into progress."
            : "Your conversations and next steps are waiting."}
        </p>
        {demo && (
          <div className="notice">
            <Info size={16} />
            This preview runs in demo mode. Open the workspace to explore.
          </div>
        )}
        {!signup && (
          <button className="text-button" onClick={() => setForgot(true)}>
            Forgot password?
          </button>
        )}
        {forgot && (
          <Modal
            title="Reset your password"
            sub="We’ll send a password reset link if the email has an account."
            onClose={() => setForgot(false)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (demo) {
                  toast("Password recovery is available in the live app.");
                  return;
                }
                try {
                  const r = await request("/auth/forgot", "POST", { email });
                  toast(r.message);
                  setForgot(false);
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="primary full">Send reset link</button>
            </form>
          </Modal>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (demo) {
              go(
                sessionStorage.getItem("flowmind-pending-invite")
                  ? "invite/" +
                      sessionStorage.getItem("flowmind-pending-invite")
                  : "dashboard",
              );
              return;
            }
            setBusy(true);
            try {
              const r = await request(
                "/auth/" + (signup ? "signup" : "login"),
                "POST",
                signup
                  ? {
                      name,
                      email,
                      password,
                      workspace,
                      timezone: "Africa/Lagos",
                      referral:
                        new URLSearchParams(window.location.search).get(
                          "ref",
                        ) || undefined,
                    }
                  : { email, password, code },
              );
              setToken(r.accessToken);
              onSignedIn();
              go(
                sessionStorage.getItem("flowmind-pending-invite")
                  ? "invite/" +
                      sessionStorage.getItem("flowmind-pending-invite")
                  : "dashboard",
              );
            } catch (e: any) {
              toast(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <>
              <label>
                Your name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label>
                Workspace name
                <input
                  required
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={signup ? 12 : 1}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          {!signup && (
            <label>
              Authenticator code <span className="subtle">(if enabled)</span>
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null}
            {demo
              ? "Open demo workspace"
              : signup
                ? "Create workspace"
                : "Sign in"}
            <ArrowRight size={15} />
          </button>
        </form>
        <p>
          {signup ? "Already have an account?" : "New to FlowMind?"}{" "}
          <button
            className="text-button"
            onClick={() => go(signup ? "login" : "signup")}
          >
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}

export function Landing() {
  const { go, demo, toast } = useFlow();
  return (
    <div className="landing">
      <nav>
        <Logo />
        <div>
          <a href="#landing-features">Features</a>
          <a href="#landing-pricing">Pricing</a>
          <button className="secondary" onClick={() => go("login")}>
            Sign in
          </button>
          <button
            className="primary"
            onClick={() => go(demo ? "dashboard" : "signup")}
          >
            {demo ? "Explore demo" : "Get started"}
            <ArrowRight size={14} />
          </button>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="eyebrow">
          <span className="status-dot" />
          CONVERSATIONS WITH A NEXT CHAPTER
        </div>
        <h1>
          Every meeting,
          <br />
          turned into <span>action.</span>
        </h1>
        <p>
          Capture the conversation. Connect the decisions.
          <br />
          Keep every commitment moving forward.
        </p>
        <div>
          <button
            className="primary"
            onClick={() => go(demo ? "dashboard" : "signup")}
          >
            Find your flow <ArrowRight size={16} />
          </button>
          <button className="secondary" onClick={() => go("meetings/m1")}>
            See a meeting in action <Play size={13} />
          </button>
        </div>
        <span className="landing-note">Less admin. More momentum.</span>
      </section>
      <div className="hero-product panel">
        <div className="hero-product-title">
          <Logo />
          <Badge tone="green">Meeting captured</Badge>
        </div>
        <div className="hero-product-body">
          <section>
            <div className="eyebrow">THE CONVERSATION</div>
            <div className="waveform">
              {Array.from({ length: 48 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height:
                      14 + (Math.sin(i * 1.4) + 1) * 20 + (i % 4) * 6 + "px",
                  }}
                />
              ))}
            </div>
            <p>
              <Avatar name="Sarah Chen" id="u2" />
              “I’ll share the final designs by Thursday.”
            </p>
            <Badge tone="cyan">
              <Check size={12} />
              Transcribed with context
            </Badge>
          </section>
          <ArrowRight size={25} />
          <section>
            <div className="eyebrow">THE NEXT STEP</div>
            <div className="hero-action">
              <CheckSquare size={19} />
              <div>
                <h3>Share final dashboard designs</h3>
                <p>
                  <Avatar name="Sarah Chen" id="u2" />
                  Sarah Chen <Badge tone="amber">Thu, Oct 8</Badge>
                </p>
              </div>
            </div>
            <Badge tone="green">
              <Check size={12} />
              An owner. A deadline. A plan.
            </Badge>
          </section>
        </div>
      </div>
      <section className="landing-problem">
        <div className="eyebrow">MAKE THE CONVERSATION COUNT</div>
        <h2>
          Good ideas deserve
          <br />
          more than meeting notes.
        </h2>
        <div className="landing-feature-grid">
          {[
            {
              icon: AudioLines,
              title: "Keep the whole conversation",
              text: "Searchable transcripts with timestamps and speaker labels let you revisit the moment that matters.",
            },
            {
              icon: ListTodo,
              title: "Give every next step an owner",
              text: "AI captures commitments, deadlines, and their source quotes. Your action board keeps them visible.",
            },
            {
              icon: Bell,
              title: "Build follow-through into the flow",
              text: "Reminders and team digests help commitments survive the space between meetings.",
            },
          ].map((f) => (
            <div className="panel" key={f.title}>
              <f.icon size={25} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="landing-features" className="landing-features">
        {[
          [
            "01",
            "Your meeting, remembered.",
            "Upload or record a conversation and watch a clear, reliable pipeline turn audio into searchable context.",
            "Upload → Transcribe → Identify speakers",
          ],
          [
            "02",
            "From “we should” to “I will.”",
            "See each commitment with an owner, deadline, confidence score, and a quote from the original conversation.",
            "Extract actions → Review → Track progress",
          ],
          [
            "03",
            "Keep the promise moving.",
            "Quiet hours, due-date reminders, and shared team workflows make follow-through part of the routine.",
            "Assign → Remind → Complete",
          ],
        ].map(([n, title, text, steps]) => (
          <div className="landing-feature" key={n}>
            <div>
              <span className="eyebrow">{n} / MEETING INTELLIGENCE</span>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
            <div className="feature-visual panel">
              <BrainCircuit size={36} />
              <p>{steps}</p>
              <div className="progress-bar">
                <span style={{ width: "73%" }} />
              </div>
              <Badge tone="cyan">Built for a focused workflow</Badge>
            </div>
          </div>
        ))}
      </section>
      <section id="landing-pricing" className="landing-pricing">
        <div className="eyebrow">GROW AT YOUR OWN PACE</div>
        <h2>A plan for your next chapter.</h2>
        <div className="pricing-grid three">
          {[
            ["Starter", "0", "Get a feel for the flow."],
            ["Pro", "15", "More context. More momentum."],
            ["Team", "49", "Shared progress for your team."],
          ].map(([name, price, text]) => (
            <div
              className={
                "panel pricing-card " + (name === "Pro" ? "featured" : "")
              }
              key={name}
            >
              {name === "Pro" && (
                <Badge tone="cyan">For growing workflows</Badge>
              )}
              <h3>{name}</h3>
              <div className="plan-price">
                ${price}
                <span>/month</span>
              </div>
              <p>{text}</p>
              <p>
                <Check size={13} />
                Meeting intelligence
              </p>
              <p>
                <Check size={13} />
                Action tracking
              </p>
              <p>
                <Check size={13} />A focused workspace
              </p>
              <button
                className={name === "Pro" ? "primary full" : "secondary full"}
                onClick={() => go(demo ? "dashboard" : "signup")}
              >
                Get started <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="landing-last">
        <h2>
          The meeting ends.
          <br />
          The momentum continues.
        </h2>
        <button
          className="primary"
          onClick={() => go(demo ? "dashboard" : "signup")}
        >
          Start your next chapter <ArrowRight size={16} />
        </button>
      </section>
      <footer>
        <Logo />
        <span>Built by Oluwapelumi Martins · Marpel</span>
        <button className="text-button" onClick={() => go("dashboard")}>
          Open workspace <ArrowUpRight size={14} />
        </button>
      </footer>
    </div>
  );
}

export function TokenPage({ kind, token }: { kind: string; token: string }) {
  const { demo, toast, go } = useFlow();
  const [password, setPassword] = useState("");
  return (
    <div className="auth-page">
      <section className="panel padded">
        <Logo />
        <h1>
          {kind === "reset" ? "Set a new password." : "Verify your email."}
        </h1>
        <p>
          {kind === "reset"
            ? "Choose a password of at least 12 characters."
            : "Confirm this email address belongs to you."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (demo) {
              toast("Account verification requires the live API.");
              return;
            }
            try {
              await request("/auth/" + kind, "POST", { token, password });
              toast(
                kind === "reset"
                  ? "Password reset. Sign in with your new password."
                  : "Email verified.",
              );
              go("login");
            } catch (e: any) {
              toast(e.message);
            }
          }}
        >
          {kind === "reset" && (
            <label>
              New password
              <input
                type="password"
                minLength={12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button className="primary full">
            {kind === "reset" ? "Reset password" : "Verify email"}
          </button>
        </form>
      </section>
    </div>
  );
}
