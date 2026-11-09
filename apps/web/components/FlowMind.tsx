"use client";
import type { Action, Data } from "@flowmind/shared";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Info,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API, getToken, request, setToken } from "../lib/api";
import { initialData } from "../lib/demo";
import { ActionEditor, Actions } from "./actions/Actions";
import { AuthPage, Landing, TokenPage } from "./auth/Auth";
import { Dashboard } from "./dashboard/Dashboard";
import {
  MeetingResult,
  Meetings,
  ProcessingView,
  UploadMeeting,
} from "./meetings/Meetings";
import { SettingsView } from "./settings/Settings";
import { Team } from "./team/Team";
import {
  Avatar,
  Context,
  date,
  Flow,
  Logo,
  minutes,
  Modal,
  uid,
} from "./ui/common";

function WorkspaceApp() {
  const qc = useQueryClient(),
    [route, setRoute] = useState("dashboard"),
    [message, setMessage] = useState(""),
    [selectedAction, setAction] = useState<string | undefined>(undefined),
    [adding, setAdding] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [reset, setReset] = useState(false),
    [signedIn, setSignedIn] = useState(!API),
    [connected, setConnected] = useState(false),
    [workspaceOpen, setWorkspaceOpen] = useState(false),
    [workspaces, setWorkspaces] = useState<any[]>([]);
  const toast = React.useCallback((s: string) => {
    setMessage(s);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  const go = React.useCallback((r: string) => {
    window.location.hash = r;
    setRoute(r);
    setMobileMenu(false);
    window.scrollTo(0, 0);
  }, []);
  const query = useQuery<Data>({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      if (API) return request("/bootstrap");
      try {
        const saved = localStorage.getItem("flowmind-demo-v1");
        return saved ? JSON.parse(saved) : initialData();
      } catch {
        return initialData();
      }
    },
    initialData: API ? undefined : initialData(),
    retry: false,
    enabled: signedIn,
    refetchOnWindowFocus: !!API,
    refetchInterval: API && !connected ? 10000 : false,
  });
  const data = query.data || initialData();
  useEffect(() => {
    const read = () => {
      if (window.location.hash.startsWith("#invite/"))
        sessionStorage.setItem(
          "flowmind-pending-invite",
          window.location.hash.split("/")[1],
        );
      const hash = window.location.hash.slice(1);
      if (hash && !hash.startsWith("landing-")) setRoute(hash);
      else if (!hash) {
        const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
        setRoute(
          path.endsWith("/processing")
            ? "processing/" + path.split("/")[1]
            : path || "dashboard",
        );
      }
    };
    read();
    window.addEventListener("hashchange", read);
    if (!API) query.refetch();
    else
      request("/bootstrap")
        .then((d) => {
          qc.setQueryData(["bootstrap"], d);
          setSignedIn(true);
        })
        .catch(() => {
          setSignedIn(false);
          if (
            ![
              "welcome",
              "signup",
              "login",
              "reset",
              "verify",
              "invite",
            ].includes(window.location.hash.slice(1).split("/")[0])
          )
            go("login");
        });
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const mutation = useMutation({
    mutationFn: async (v: {
      path: string;
      method: string;
      body: any;
      change?: (d: Data) => any;
    }) => {
      if (API) {
        const result = await request(v.path, v.method, v.body);
        if (v.path === "/account/delete" || v.path === "/workspace/delete") {
          setToken("");
          setSignedIn(false);
          qc.clear();
          return result;
        }
        await qc.invalidateQueries({ queryKey: ["bootstrap"] });
        return result;
      }
      const d = structuredClone(
        qc.getQueryData<Data>(["bootstrap"]) || initialData(),
      );
      const result = v.change?.(d);
      if (!v.path.includes("/demo/"))
        d.logs.unshift({
          id: uid(),
          actorId: d.user.id,
          event:
            v.path.split("/").filter(Boolean).slice(0, 2).join(".") +
            ".updated",
          details: { method: v.method },
          createdAt: new Date().toISOString(),
        });
      d.logs = d.logs.slice(0, 200);
      localStorage.setItem("flowmind-demo-v1", JSON.stringify(d));
      qc.setQueryData(["bootstrap"], d);
      return result === undefined ? {} : result;
    },
  });
  const perform = React.useCallback(
    async (
      path: string,
      method: string,
      body: any,
      change?: (d: Data) => any,
    ) => {
      try {
        return await mutation.mutateAsync({ path, method, body, change });
      } catch (e: any) {
        toast(e.message);
        return null;
      }
    },
    [mutation.mutateAsync, toast],
  );
  const updateAction = React.useCallback(
    async (id: string, b: Partial<Action>) => {
      const before = qc.getQueryData<Data>(["bootstrap"]);
      if (API && before)
        qc.setQueryData(["bootstrap"], {
          ...before,
          actions: before.actions.map((a) =>
            a.id === id ? { ...a, ...b } : a,
          ),
        });
      const r = await perform("/actions/" + id, "PATCH", b, (d) => {
        const a = d.actions.find((a) => a.id === id);
        if (a) {
          Object.assign(a, b);
          a.activity.push({
            text: b.status
              ? "Status changed to " + b.status.replace("_", " ")
              : "Updated action item",
            date: new Date().toISOString(),
          });
          return a;
        }
      });
      if (API && r === null && before) qc.setQueryData(["bootstrap"], before);
      return r;
    },
    [perform, qc],
  );
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setAction(undefined);
        setAdding(false);
        setSearchOpen(false);
        setNotificationsOpen(false);
        setWorkspaceOpen(false);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    if (!API || !signedIn) return;
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || API, {
      auth: { token: getToken() },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      setConnected(true);
      const d = qc.getQueryData<Data>(["bootstrap"]);
      d?.meetings
        .filter((m) => m.status === "processing")
        .forEach((m) => socket.emit("meeting:join", { meetingId: m.id }));
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("meeting:event", (event: any) => {
      qc.setQueryData<Data>(["bootstrap"], (d) =>
        d
          ? {
              ...d,
              meetings: d.meetings.map((m) =>
                m.id === event.meetingId
                  ? {
                      ...m,
                      ...event,
                      segments: event.segments
                        ? [...m.segments, ...event.segments]
                        : m.segments,
                    }
                  : m,
              ),
            }
          : d,
      );
      if (event.status === "completed" || event.status === "failed")
        qc.invalidateQueries({ queryKey: ["bootstrap"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [signedIn, route, qc]);
  const flow: Flow = {
    data,
    demo: !API,
    route,
    go,
    toast,
    perform,
    updateAction,
    openAction: setAction,
    newAction: () => setAdding(true),
    busy: mutation.isPending,
  };
  const part = route.split("/"),
    page = part[0];
  let body: React.ReactNode =
    page === "meetings" && part[1] === "new" ? (
      <UploadMeeting />
    ) : page === "meetings" && part[1] ? (
      <MeetingResult id={part[1]} tab={part[2] || "actions"} moment={part[3]} />
    ) : page === "meetings" ? (
      <Meetings />
    ) : page === "actions" ? (
      <Actions key={route} />
    ) : page === "team" ? (
      <Team />
    ) : page === "settings" ? (
      <SettingsView section={part[1]} />
    ) : page === "processing" ? (
      <ProcessingView id={part[1]} />
    ) : page === "welcome" ? (
      <Landing />
    ) : page === "login" || page === "signup" ? (
      <AuthPage
        signup={page === "signup"}
        onSignedIn={() => {
          setSignedIn(true);
          qc.invalidateQueries({ queryKey: ["bootstrap"] });
        }}
      />
    ) : (
      <Dashboard />
    );
  if (page === "invite")
    body = (
      <div className="auth-page">
        <section className="panel padded">
          <Logo />
          <h1>You’re invited.</h1>
          <p>Sign in with the invited email address to join the workspace.</p>
          <button
            className="primary"
            onClick={async () => {
              if (!API) {
                toast("Invitations are available in the live app.");
                return;
              }
              try {
                const r = await request("/team/accept", "POST", {
                  token: part[1],
                });
                const switched = await request("/workspaces/switch", "POST", {
                  workspaceId: r.workspaceId,
                });
                setToken(switched.accessToken);
                await qc.invalidateQueries({ queryKey: ["bootstrap"] });
                go("dashboard");
              } catch (e: any) {
                toast(e.message);
              }
            }}
          >
            Accept invitation
          </button>
          <button className="secondary" onClick={() => go("login")}>
            Sign in
          </button>
        </section>
      </div>
    );
  if (page === "reset" || page === "verify")
    body = <TokenPage kind={page} token={part[1]} />;
  if (
    API &&
    !signedIn &&
    !["welcome", "login", "signup", "reset", "verify", "invite"].includes(page)
  )
    body = (
      <AuthPage
        onSignedIn={() => {
          setSignedIn(true);
          qc.invalidateQueries({ queryKey: ["bootstrap"] });
        }}
      />
    );
  const full =
    [
      "reset",
      "verify",
      "welcome",
      "login",
      "signup",
      "processing",
      "invite",
    ].includes(page) ||
    (!!API && !signedIn);
  return (
    <Context.Provider value={flow}>
      {full ? (
        body
      ) : (
        <div className="app-shell">
          <aside className={"sidebar " + (mobileMenu ? "mobile-open" : "")}>
            <button className="brand-button" onClick={() => go("dashboard")}>
              <Logo />
            </button>
            <div className="workspace-picker">
              <button
                onClick={async () => {
                  setWorkspaceOpen((v) => !v);
                  if (API)
                    try {
                      setWorkspaces(await request("/workspaces"));
                    } catch {}
                }}
              >
                <span className="workspace-monogram small">
                  {data.workspace.name[0]}
                </span>
                <span>
                  <strong>{data.workspace.name}</strong>
                  <small>Team workspace</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {workspaceOpen && (
                <div className="workspace-menu">
                  {API ? (
                    workspaces.map((w) => (
                      <button
                        key={w.workspace.id}
                        onClick={async () => {
                          const r = await request(
                            "/workspaces/switch",
                            "POST",
                            { workspaceId: w.workspace.id },
                          );
                          setToken(r.accessToken);
                          await qc.invalidateQueries({
                            queryKey: ["bootstrap"],
                          });
                          setWorkspaceOpen(false);
                          go("dashboard");
                        }}
                      >
                        {w.workspace.name}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={() => {
                        setWorkspaceOpen(false);
                        go("settings/workspace");
                      }}
                    >
                      Manage {data.workspace.name}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="nav-label">WORKSPACE</div>
            <nav className="main-nav">
              {[
                ["dashboard", "Overview", LayoutDashboard],
                ["meetings", "Meetings", AudioLines],
                ["actions", "Action items", ListTodo],
                ["team", "Team", Users],
              ].map(([id, label, Icon]: any) => (
                <button
                  key={id}
                  className={
                    page === id || (id === "dashboard" && page === "")
                      ? "active"
                      : ""
                  }
                  onClick={() => go(id)}
                >
                  <Icon size={17} />
                  {label}
                  {id === "actions" && (
                    <span>
                      {data.actions.filter((a) => a.status !== "done").length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="sidebar-divider" />
            <div className="nav-label">PREFERENCES</div>
            <nav className="main-nav">
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => go("settings/profile")}
              >
                <Settings size={17} />
                Settings
              </button>
              <button onClick={() => go("settings/integrations")}>
                <LayoutGrid size={17} />
                Integrations
                <ArrowUpRight size={12} />
              </button>
            </nav>
            <div className="sidebar-bottom">
              <div className="sidebar-tip">
                <span className="tip-icon">
                  <BrainCircuit size={20} />
                </span>
                <strong>
                  A little less admin.
                  <br />A lot more momentum.
                </strong>
                <p>Bring your next conversation into focus.</p>
                <button onClick={() => go("meetings/new")}>
                  Capture a meeting <ArrowRight size={13} />
                </button>
              </div>
              <button className="help-link" onClick={() => go("welcome")}>
                <HelpCircle size={15} />
                About FlowMind <ArrowUpRight size={12} />
              </button>
              {!API && (
                <button className="demo-label" onClick={() => setReset(true)}>
                  <span className="status-dot" />
                  Demo workspace <RotateCcw size={11} />
                </button>
              )}
              <div className="user-menu">
                <Avatar name={data.user.name} id={data.user.id} />
                <button onClick={() => go("settings/profile")}>
                  <strong>{data.user.name}</strong>
                  <small>{data.user.email}</small>
                </button>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={async () => {
                    if (API)
                      await request("/auth/logout", "POST").catch(() => {});
                    setToken("");
                    setSignedIn(!API);
                    if (API) qc.clear();
                    go("login");
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div>
                <button
                  className="icon-button mobile-menu-button"
                  aria-label="Open navigation"
                  onClick={() => setMobileMenu((v) => !v)}
                >
                  <Menu size={19} />
                </button>
                <span className="breadcrumb">
                  Workspace <ChevronRight size={12} />
                  <strong>
                    {page === "dashboard"
                      ? "Overview"
                      : page === "meetings"
                        ? "Meetings"
                        : page === "actions"
                          ? "Action items"
                          : page === "team"
                            ? "Team"
                            : "Settings"}
                  </strong>
                </span>
              </div>
              <div className="topbar-right">
                <button
                  className="global-search"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search size={14} />
                  <span>Search anything…</span>
                  <kbd>⌘ K</kbd>
                </button>
                <span className="topbar-divider" />
                <button
                  className="icon-button notification-button"
                  aria-label="Open notifications"
                  onClick={() => setNotificationsOpen(true)}
                >
                  <Bell size={18} />
                  {data.notifications.some((n) => !n.read) && <i />}
                </button>
                <Avatar name={data.user.name} id={data.user.id} />
              </div>
            </header>
            <main className="page-content">
              {query.isLoading && API ? (
                <div className="empty">
                  <Loader2 className="spin" size={30} />
                  <h3>Opening your workspace…</h3>
                </div>
              ) : (
                body
              )}
            </main>
            <footer className="app-footer">
              <span>
                FLOWMIND <span className="dot-sep">/</span> EVERY CONVERSATION
                COUNTS.
              </span>
              <span className="service-status">
                <span className="status-dot" />
                {API
                  ? connected
                    ? "Live updates connected"
                    : "API connected · polling fallback"
                  : "Sample workspace · saved in this browser"}
              </span>
            </footer>
          </div>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <Info size={16} />
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(selectedAction || adding) && (
        <ActionEditor
          key={selectedAction || "new"}
          id={selectedAction}
          onClose={() => {
            setAction(undefined);
            setAdding(false);
          }}
        />
      )}
      {searchOpen && (
        <Modal
          title="Find your next step"
          onClose={() => setSearchOpen(false)}
          wide
        >
          <div className="search-input large-search">
            <Search size={17} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings, transcripts, and actions…"
            />
          </div>
          <div className="search-results">
            <div className="eyebrow">MEETINGS & TRANSCRIPTS</div>
            {data.meetings
              .filter((m) =>
                (m.title + " " + m.segments.map((s) => s.text).join(" "))
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .slice(0, 5)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSearchOpen(false);
                    go(
                      "meetings/" +
                        m.id +
                        (search &&
                        !m.title.toLowerCase().includes(search.toLowerCase())
                          ? "/transcript"
                          : ""),
                    );
                  }}
                >
                  <AudioLines size={16} />
                  <span>
                    {m.title}
                    <small>
                      {date(m.date)} · {minutes(m.durationSeconds)}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            <div className="eyebrow">ACTION ITEMS</div>
            {data.actions
              .filter((a) =>
                a.title.toLowerCase().includes(search.toLowerCase()),
              )
              .slice(0, 5)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setSearchOpen(false);
                    setAction(a.id);
                  }}
                >
                  <ListTodo size={16} />
                  <span>
                    {a.title}
                    <small>
                      {a.status.replace("_", " ")} · {date(a.dueDate)}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {notificationsOpen && (
        <Modal
          title="Your updates"
          sub="The little things that keep the work moving."
          onClose={() => setNotificationsOpen(false)}
        >
          {data.notifications.map((n) => (
            <div className="notification-row" key={n.id}>
              <span className="meeting-symbol">
                <Bell size={17} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{date(n.createdAt)}</small>
              </div>
              {!n.read && <span className="status-dot cyan-text" />}
            </div>
          ))}
          <button
            className="secondary full"
            onClick={async () => {
              await perform("/notifications/read", "PATCH", {}, (d) =>
                d.notifications.forEach((n) => (n.read = true)),
              );
              toast("All updates marked as read");
            }}
          >
            <Check size={14} />
            Mark all as read
          </button>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Reset the demo workspace?"
          sub="Your local edits will be replaced with the original sample meetings and actions."
          onClose={() => setReset(false)}
        >
          <div className="modal-actions">
            <button className="secondary" onClick={() => setReset(false)}>
              Keep my edits
            </button>
            <button
              className="primary"
              onClick={() => {
                const fresh = initialData();
                localStorage.setItem("flowmind-demo-v1", JSON.stringify(fresh));
                qc.setQueryData(["bootstrap"], fresh);
                setReset(false);
                go("dashboard");
                toast("Demo workspace reset");
              }}
            >
              <RotateCcw size={14} />
              Reset demo
            </button>
          </div>
        </Modal>
      )}
    </Context.Provider>
  );
}

export default function FlowMind() {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { staleTime: 15000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <WorkspaceApp />
    </QueryClientProvider>
  );
}
