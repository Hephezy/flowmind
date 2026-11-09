"use client";
import type { Action, Data } from "@flowmind/shared";
import { isOverdue } from "@flowmind/shared";
import { AudioLines, BrainCircuit, Clock, X } from "lucide-react";
import React, { createContext, useContext, useEffect, useRef } from "react";

export const uid = () => crypto.randomUUID();

export const date = (
  v: string | null,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) => (v ? new Date(v).toLocaleDateString("en-US", options) : "No due date");

export const minutes = (n: number) => `${Math.floor(n / 60)} min`;

export const stamp = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

export const initials = (n: string) =>
  n
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const colours = ["cyan", "purple", "amber", "pink"];

export interface Flow {
  data: Data;
  demo: boolean;
  route: string;
  go: (v: string) => void;
  toast: (v: string) => void;
  perform: (
    path: string,
    method: string,
    body: any,
    change?: (d: Data) => any,
  ) => Promise<any>;
  updateAction: (id: string, b: Partial<Action>) => Promise<any>;
  openAction: (id: string) => void;
  newAction: () => void;
  busy: boolean;
}

export const Context = createContext<Flow | null>(null);

export const useFlow = () => useContext(Context)!;

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <AudioLines size={20} strokeWidth={2.5} />
      </span>
      FlowMind<span className="logo-dot">.</span>
    </span>
  );
}

export function Avatar({
  name,
  id = "u1",
  size = "",
}: {
  name: string;
  id?: string;
  size?: string;
}) {
  const flow = useContext(Context);
  if (flow?.data.user.name === name && flow.data.settings.avatarUrl)
    return (
      <img
        src={flow.data.settings.avatarUrl}
        alt={name}
        className={`avatar ${size}`}
      />
    );
  return (
    <span
      className={`avatar ${colours[(Number(id.replace(/\D/g, "")) || 1) % 4]} ${size}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function Avatars({ names }: { names: string[] }) {
  return (
    <span className="avatar-stack">
      {names.slice(0, 3).map((name, i) => (
        <Avatar key={name} name={name} id={"u" + (i + 1)} />
      ))}
      {names.length > 3 && (
        <span className="avatar more">+{names.length - 3}</span>
      )}
    </span>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <BrainCircuit size={38} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  sub,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Heading({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}

export function Due({ action }: { action: Action }) {
  const overdue = isOverdue(action);
  return (
    <span className={`due ${overdue ? "late" : ""}`}>
      <Clock size={12} />
      {date(action.dueDate)}
      {overdue && " · overdue"}
    </span>
  );
}

export function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle ${value ? "on" : ""}`}
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}

export function highlight(text: string, search: string) {
  const index = text.toLowerCase().indexOf(search.toLowerCase());
  return index < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + search.length)}</mark>
      {text.slice(index + search.length)}
    </>
  );
}
