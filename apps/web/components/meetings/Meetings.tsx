"use client";
import type { Meeting } from "@flowmind/shared";
import { stages } from "@flowmind/shared";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  Info,
  LayoutGrid,
  Link2,
  List,
  ListTodo,
  Loader2,
  Lock,
  Mail,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { API, download, getToken, request, uploadFile } from "../../lib/api";
import { demoSegments, initialData } from "../../lib/demo";
import {
  Avatar,
  Avatars,
  Badge,
  date,
  Due,
  Empty,
  Heading,
  highlight,
  Logo,
  minutes,
  Modal,
  stamp,
  Toggle,
  uid,
  useFlow,
} from "../ui/common";

export function MeetingRow({ m }: { m: Meeting }) {
  const { data, go } = useFlow(),
    actions = data.actions.filter((a) => a.meetingId === m.id);
  return (
    <button
      className="meeting-row"
      onClick={() =>
        go(
          m.status === "processing" ? "processing/" + m.id : "meetings/" + m.id,
        )
      }
    >
      <span className="meeting-symbol">
        <AudioLines size={20} />
      </span>
      <span className="meeting-name">
        <strong>{m.title}</strong>
        <span>
          {date(m.date)} <span className="dot-sep">·</span>{" "}
          {minutes(m.durationSeconds)} {m.isPrivate && <Lock size={11} />}
        </span>
      </span>
      <span className="meeting-people">
        <Avatars names={m.participants} />
      </span>
      <span className="meeting-actions">
        <ListTodo size={13} />
        {actions.length}
      </span>
      <Badge
        tone={
          m.status === "completed"
            ? "green"
            : m.status === "failed"
              ? "red"
              : "cyan"
        }
      >
        <span className="status-dot" />
        {m.status === "completed"
          ? "Ready"
          : m.status === "failed"
            ? "Failed"
            : "Processing"}
      </Badge>
      <ChevronRight className="row-arrow" size={16} />
    </button>
  );
}

export function Meetings() {
  const { data, go, perform, toast } = useFlow();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [grid, setGrid] = useState(false);
  const filtered = data.meetings
    .filter((m) =>
      (m.title + " " + m.segments.map((s) => s.text).join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (m) =>
        filter === "All" ||
        (filter === "Private" && m.isPrivate) ||
        (filter === "Processing" && m.status === "processing") ||
        (filter === "Failed" && m.status === "failed") ||
        (filter === "This week" &&
          Date.parse(m.date) > Date.now() - 7 * 86400000),
    );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  return (
    <>
      <Heading
        eyebrow="THE MEETING LIBRARY"
        title="Every conversation, remembered."
        sub="Find the context, decisions, and actions that keep your team moving."
      >
        <button className="primary" onClick={() => go("meetings/new")}>
          <Plus size={16} />
          New meeting
        </button>
      </Heading>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings or transcript text…"
            aria-label="Search meetings"
          />
        </div>
        <div className="segmented">
          <button
            className={!grid ? "active" : ""}
            onClick={() => setGrid(false)}
            aria-label="List view"
          >
            <List size={16} />
          </button>
          <button
            className={grid ? "active" : ""}
            onClick={() => setGrid(true)}
            aria-label="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>
      <div className="filter-pills">
        {["All", "This week", "Processing", "Failed", "Private"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
            {f === "All" && <span>{data.meetings.length}</span>}
          </button>
        ))}
      </div>
      {filtered.length ? (
        grid ? (
          <div className="meeting-grid">
            {filtered.map((m) => {
              const tasks = data.actions.filter((a) => a.meetingId === m.id),
                done = tasks.filter((a) => a.status === "done").length;
              return (
                <button
                  className="meeting-card panel"
                  key={m.id}
                  onClick={() => go("meetings/" + m.id)}
                >
                  <div>
                    <span className="meeting-symbol">
                      <AudioLines size={22} />
                    </span>
                    <Badge tone={m.status === "completed" ? "green" : "amber"}>
                      {m.status === "completed" ? "Ready" : m.status}
                    </Badge>
                  </div>
                  <h3>{m.title}</h3>
                  <p>
                    {date(m.date)} · {minutes(m.durationSeconds)}
                  </p>
                  <Avatars names={m.participants} />
                  <div className="meeting-card-progress">
                    <span>
                      {done}/{tasks.length} actions complete
                    </span>
                    <div className="progress-bar">
                      <span
                        style={{
                          width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel meeting-library">
            <div className="library-head">
              <span>MEETING</span>
              <span>DURATION</span>
              <span>DATE</span>
              <span>PARTICIPANTS</span>
              <span>ACTIONS</span>
              <span>STATUS</span>
              <span />
            </div>
            {filtered.map((m) => (
              <div className="library-row" key={m.id}>
                <button
                  onClick={() =>
                    go(
                      m.status === "processing"
                        ? "processing/" + m.id
                        : "meetings/" + m.id,
                    )
                  }
                >
                  <span className="meeting-symbol">
                    <AudioLines size={18} />
                  </span>
                  <strong>{m.title}</strong>
                  {m.isPrivate && <Lock size={12} />}
                </button>
                <span>{minutes(m.durationSeconds)}</span>
                <span>{date(m.date)}</span>
                <Avatars names={m.participants} />
                <span>
                  {data.actions.filter((a) => a.meetingId === m.id).length}
                </span>
                <Badge
                  tone={
                    m.status === "completed"
                      ? "green"
                      : m.status === "failed"
                        ? "red"
                        : "cyan"
                  }
                >
                  {m.status === "completed" ? "Ready" : m.status}
                </Badge>
                <button
                  className="icon-button"
                  aria-label={"Delete " + m.title}
                  onClick={() => setDeleteId(m.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="library-bottom">
              Showing {filtered.length} of {data.meetings.length} meetings
            </div>
          </div>
        )
      ) : (
        <Empty
          title="No meetings found"
          body="Try another search, or add your first conversation."
          action={
            <button className="primary" onClick={() => go("meetings/new")}>
              <Plus size={15} />
              New meeting
            </button>
          }
        />
      )}{" "}
      {deleteId && (
        <Modal
          title="Delete meeting?"
          sub="Its transcript, summary, and linked action items will also be removed."
          onClose={() => setDeleteId(null)}
        >
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleteId(null)}>
              Keep meeting
            </button>
            <button
              className="danger"
              onClick={async () => {
                await perform(
                  "/meetings/" + deleteId,
                  "DELETE",
                  undefined,
                  (d) => {
                    d.meetings = d.meetings.filter((m) => m.id !== deleteId);
                    d.actions = d.actions.filter(
                      (a) => a.meetingId !== deleteId,
                    );
                  },
                );
                setDeleteId(null);
                toast("Meeting deleted");
              }}
            >
              Delete meeting
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function UploadMeeting() {
  const { data, demo, go, perform, toast } = useFlow();
  const [mode, setMode] = useState("upload"),
    [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [participants, setParticipants] = useState(""),
    [context, setContext] = useState(""),
    [transcript, setTranscript] = useState(""),
    [link, setLink] = useState(""),
    [privateMeeting, setPrivate] = useState(false),
    [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [progress, setProgress] = useState(0),
    [submitting, setSubmitting] = useState(false),
    [meetingId, setMeetingId] = useState(""),
    [recordings, setRecordings] = useState<any[]>([]),
    [provider, setProvider] = useState("zoom"),
    [recordingId, setRecordingId] = useState(""),
    [meetingDate, setMeetingDate] = useState(
      new Date().toISOString().slice(0, 16),
    );
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function selectFile(f?: File) {
    if (!f) return;
    if (!/\.(mp3|mp4|m4a|wav|webm)$/i.test(f.name) || f.size > 2 * 1024 ** 3) {
      toast("Choose MP3, MP4, M4A, WAV or WebM up to 2GB.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const r = new MediaRecorder(media);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        selectFile(
          new File(chunks, "Meeting recording.webm", { type: r.mimeType }),
        );
        media.getTracks().forEach((t) => t.stop());
      };
      r.start(1000);
      setElapsed(0);
      setRecording(true);
    } catch {
      toast(
        "Microphone access is needed to record. You can upload a file instead.",
      );
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (recording) {
      toast("Stop recording before processing.");
      return;
    }
    if (
      (!demo && mode === "upload" && !file) ||
      (!demo && mode === "transcript" && !transcript.trim()) ||
      (!demo && mode === "link" && !recordingId)
    ) {
      toast("Add a recording or transcript first.");
      return;
    }
    setSubmitting(true);
    try {
      const metadata = {
        title: title || "Untitled meeting",
        date: new Date(meetingDate).toISOString(),
        participants: participants
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        context,
        isPrivate: privateMeeting,
      };
      let id = meetingId;
      if (!id) {
        const result = await perform("/meetings", "POST", metadata, (d) => {
          const m: Meeting = {
            id: uid(),
            ...metadata,
            createdAt: new Date().toISOString(),
            durationSeconds: 528,
            status: "processing",
            stage: "upload",
            progress: 0,
            segments: [],
            summary: "",
            topics: [],
            keyDecisions: [],
            source: "demo",
          };
          d.meetings.unshift(m);
          return m;
        });
        if (!result) return;
        id = result.id;
        setMeetingId(id);
      }
      if (!demo) {
        if (mode === "transcript")
          await request("/meetings/" + id + "/transcript", "POST", {
            segments: transcript
              .split("\n")
              .filter(Boolean)
              .map((text, i) => ({
                speaker: "Unidentified speaker",
                text,
                startSec: i * 30,
                endSec: (i + 1) * 30,
              })),
          });
        else if (mode === "link")
          await request("/meetings/" + id + "/import", "POST", {
            provider,
            recordingId,
          });
        else if (file) await uploadFile(id, file, setProgress);
        await request("/meetings/" + id + "/process", "POST");
      } else if (mode === "transcript" && transcript.trim()) {
        await perform("/meetings/" + id, "PATCH", {}, (d) => {
          const m = d.meetings.find((m) => m.id === id)!;
          m.segments = transcript
            .split("\n")
            .filter(Boolean)
            .map((line, i) => {
              const parts = line.split(":");
              return {
                speaker:
                  parts.length > 1
                    ? parts.shift()!.trim()
                    : "Unidentified speaker",
                text: parts.join(":").trim(),
                startSec: i * 30,
                endSec: (i + 1) * 30,
              };
            });
          m.source = "demo-transcript";
        });
      }
      go("processing/" + id);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <button className="back-link" onClick={() => go("meetings")}>
        <ArrowLeft size={14} />
        Back to meetings
      </button>
      <Heading
        eyebrow="CAPTURE A CONVERSATION"
        title="Great meetings deserve follow-through."
        sub="Upload a recording, record live, or bring an existing transcript."
      />
      {demo && (
        <div className="notice">
          <Info size={17} />
          <span>
            <strong>Interactive demo.</strong> Recordings stay in your browser.
            Processing shows a sample workflow; paste a transcript to explore
            your own text.
          </span>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="capture-tabs segmented">
          {[
            ["upload", "Upload recording", Upload],
            ["record", "Record audio", Mic],
            ["transcript", "Paste transcript", FileText],
            ["link", "Import recording", Link2],
          ].map(([id, label, Icon]: any) => (
            <button
              type="button"
              key={id}
              className={mode === id ? "active" : ""}
              onClick={() => setMode(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        {mode === "upload" && (
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              selectFile(e.dataTransfer.files[0]);
            }}
          >
            <span className="capture-icon">
              <Upload size={29} />
            </span>
            <h3>{file ? file.name : "Drop your meeting recording here"}</h3>
            <p>
              {file
                ? `${(file.size / 1024 ** 2).toFixed(1)} MB · Ready to upload`
                : "or choose a file from your device"}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => fileInput.current?.click()}
            >
              {file ? "Change file" : "Browse files"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".mp3,.mp4,.m4a,.wav,.webm"
              hidden
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
            <span className="upload-types">
              MP3, MP4, M4A, WAV, WEBM · UP TO 2 GB
            </span>
          </div>
        )}
        {mode === "record" && (
          <div className="upload-zone">
            <span className={`capture-icon ${recording ? "recording" : ""}`}>
              <Mic size={29} />
            </span>
            <h3>
              {recording
                ? `Recording · ${stamp(elapsed)}`
                : file
                  ? "Your recording is ready"
                  : "Be present. We’ll remember the details."}
            </h3>
            <p>
              {recording
                ? "Your microphone is capturing audio."
                : "Record directly from your browser microphone."}
            </p>
            <button
              type="button"
              className={recording ? "danger" : "primary"}
              onClick={record}
            >
              {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
              {recording ? "Stop recording" : "Start recording"}
            </button>
          </div>
        )}
        {mode === "transcript" && (
          <div className="panel padded">
            <label>
              Meeting transcript
              <textarea
                rows={10}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={
                  "Pelumi: Let’s review the beta launch.\nSarah: I’ll share the final designs by Thursday."
                }
              />
            </label>
            <p className="field-help">
              One speaker turn per line. Prefix a line with a name and a colon
              to identify the speaker.
            </p>
          </div>
        )}
        {mode === "link" && (
          <div className="panel padded">
            <h3>Import a cloud recording</h3>
            <p>
              Connect your recording provider, then choose a file you have
              permission to access.
            </p>
            <div className="form-grid">
              <label>
                Provider
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="zoom">Zoom</option>
                  <option value="google">Google Drive / Meet</option>
                  <option value="teams">Microsoft Teams</option>
                </select>
              </label>
              <label>
                Meeting link (reference)
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://zoom.us/j/…"
                />
              </label>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                if (demo) {
                  toast(
                    "Connect a recording provider in the live app to import recordings.",
                  );
                  return;
                }
                try {
                  setRecordings(
                    await request("/integrations/" + provider + "/recordings"),
                  );
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              <Folder size={15} />
              Load my recordings
            </button>
            {recordings.length > 0 && (
              <label>
                Select recording
                <select
                  value={recordingId}
                  onChange={(e) => setRecordingId(e.target.value)}
                >
                  <option value="">Choose a recording</option>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="field-help">
              A meeting link alone does not grant access to its recording.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => go("settings/integrations")}
              >
                Connect providers <ArrowUpRight size={12} />
              </button>
            </p>
          </div>
        )}
        <section className="panel padded details-form">
          <h2>Meeting details</h2>
          <p>A little context helps create better outcomes.</p>
          <div className="form-grid">
            <label className="span-2">
              Meeting title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product team · Weekly sync"
                maxLength={200}
              />
            </label>
            <label>
              Date & time
              <input
                type="datetime-local"
                required
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </label>
            <label>
              Workspace
              <select>
                <option>{data.workspace.name}</option>
              </select>
            </label>
            <label className="span-2">
              Participants
              <input
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Pelumi Martins, Sarah Chen, David Okafor"
              />
              <span className="field-help">
                Separate participant names with commas.
              </span>
            </label>
            <label className="span-2">
              Context notes <span className="subtle">(optional)</span>
              <textarea
                rows={3}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="What should the AI know about this meeting?"
              />
            </label>
          </div>
          <div className="toggle-row">
            <div>
              <strong>Private meeting</strong>
              <p>Only you can view its recording and results.</p>
            </div>
            <Toggle value={privateMeeting} onChange={setPrivate} />
          </div>
        </section>
        {submitting && progress > 0 && (
          <div className="upload-progress">
            <span>Uploading · {progress}%</span>
            <div className="progress-bar">
              <span style={{ width: progress + "%" }} />
            </div>
          </div>
        )}
        <button
          className="primary full process-button"
          type="submit"
          disabled={submitting || recording}
        >
          {submitting ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <BrainCircuit size={17} />
          )}{" "}
          {submitting
            ? "Preparing your meeting…"
            : demo
              ? "Preview processing"
              : "Process meeting"}
          <ArrowRight size={16} />
        </button>
        <p className="center-help">
          <Lock size={12} />
          Your meeting stays within your workspace.
        </p>
      </form>
    </>
  );
}

export function ProcessingView({ id }: { id: string }) {
  const { data, demo, go, perform, toast } = useFlow();
  const m = data.meetings.find((m) => m.id === id);
  const stageNames = [
    "Upload recording",
    "Transcribe conversation",
    "Identify speakers",
    "Extract action items",
    "Generate summary",
    "Notify your team",
  ];
  useEffect(() => {
    if (!demo || !m || m.status !== "processing") return;
    const timer = setInterval(() => {
      perform("/demo/pipeline", "PATCH", {}, (d) => {
        const meeting = d.meetings.find((v) => v.id === id);
        if (!meeting || meeting.status !== "processing") return;
        const index = stages.indexOf(meeting.stage);
        if (meeting.progress < 100)
          meeting.progress = Math.min(100, meeting.progress + 25);
        else if (index < 5) {
          meeting.stage = stages[index + 1];
          meeting.progress = 0;
        } else {
          meeting.status = "completed";
          if (!meeting.segments.length) meeting.segments = demoSegments;
          meeting.summary =
            meeting.source === "demo-transcript"
              ? "Local transcript preview. Review the original text below; connect the live API for an AI-generated summary and validated action extraction."
              : "Sample meeting: the team aligned on the beta launch and assigned design, engineering, and onboarding deliverables.";
          meeting.topics =
            meeting.source === "demo-transcript"
              ? ["Transcript preview"]
              : ["Beta launch", "Engineering", "Design"];
          meeting.keyDecisions =
            meeting.source === "demo-transcript"
              ? []
              : [
                  "Keep the beta focused on the core workflow.",
                  "Review the beta next Monday.",
                ];
          if (meeting.source !== "demo-transcript") {
            d.actions.unshift(
              ...initialData()
                .actions.slice(0, 4)
                .map((a) => ({
                  ...a,
                  id: uid(),
                  meetingId: id,
                  status: "todo" as const,
                })),
            );
          }
          d.notifications.unshift({
            id: uid(),
            title: "Your meeting preview is ready",
            body: meeting.title,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      });
    }, 550);
    return () => clearInterval(timer);
  }, [demo, id, m?.status, perform]);
  if (!m)
    return (
      <Empty title="Meeting not found" body="Return to the meeting library." />
    );
  const index = stages.indexOf(m.stage);
  return (
    <div className="processing-focus">
      <Logo />
      <div className="eyebrow">FROM CONVERSATION TO CLARITY</div>
      <h1>
        {m.status === "completed"
          ? "Your meeting is ready."
          : m.status === "failed"
            ? "Let’s get back on track."
            : "Connecting the dots."}
      </h1>
      <p>We’re capturing the details so you can focus on what’s next.</p>
      <section className="panel processing-card">
        <div className="processing-title">
          <span className="meeting-symbol">
            <AudioLines size={21} />
          </span>
          <div>
            <h3>{m.title}</h3>
            <p>
              {date(m.date)} · {m.participants.length} participants
            </p>
          </div>
          {demo && <Badge tone="amber">Sample preview</Badge>}
        </div>
        <div className="pipeline">
          {stageNames.map((name, i) => {
            const complete =
              i < index ||
              m.status === "completed" ||
              (i === index && m.progress === 100);
            const active = i === index && m.status === "processing";
            return (
              <div
                className={`pipeline-step ${active ? "active" : ""} ${complete ? "complete" : ""}`}
                key={name}
              >
                <span className="pipeline-circle">
                  {complete ? (
                    <Check size={15} />
                  ) : active ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </span>
                <div>
                  <div className="pipeline-step-title">
                    <strong>{name}</strong>
                    <span>
                      {complete
                        ? "Complete"
                        : active
                          ? `${m.progress}%`
                          : "Pending"}
                    </span>
                  </div>
                  {active && (
                    <>
                      <div className="progress-bar">
                        <span style={{ width: m.progress + "%" }} />
                      </div>
                      {i === 1 && (
                        <div className="live-transcript">
                          <span>
                            TRANSCRIPT PREVIEW {demo ? "· SAMPLE" : ""}
                          </span>
                          <p>
                            {m.segments.at(-1)?.text || demoSegments[0].text}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {m.status === "failed" && (
          <div className="notice amber">
            <AlertCircle size={16} />
            {m.error || "Processing failed. The current stage can be retried."}
          </div>
        )}
        <div className="processing-footer">
          {m.status === "completed" ? (
            <button
              className="primary full"
              onClick={() => go("meetings/" + id)}
            >
              Explore meeting results <ArrowRight size={16} />
            </button>
          ) : m.status === "failed" ? (
            <button
              className="primary full"
              onClick={() =>
                perform("/meetings/" + id + "/retry", "POST", {}, (d) => {
                  const m = d.meetings.find((m) => m.id === id)!;
                  m.status = "processing";
                  m.error = null;
                })
              }
            >
              Retry failed stage
            </button>
          ) : (
            <>
              <p>
                <Mail size={14} />
                {demo
                  ? "This preview uses sample data."
                  : "We’ll notify you when your meeting is ready."}
              </p>
              <button
                className="secondary"
                onClick={() =>
                  perform("/meetings/" + id + "/cancel", "POST", {}, (d) => {
                    const m = d.meetings.find((m) => m.id === id)!;
                    m.status = "failed";
                    m.error = "Cancelled by user";
                  })
                }
              >
                Cancel processing
              </button>
            </>
          )}
        </div>
      </section>
      <button className="back-link" onClick={() => go("meetings")}>
        <ArrowLeft size={14} />
        Back to my workspace
      </button>
    </div>
  );
}

export function MeetingResult({
  id,
  tab = "actions",
  moment,
}: {
  id: string;
  tab?: string;
  moment?: string;
}) {
  const { data, demo, go, openAction, updateAction, perform, toast } =
      useFlow(),
    m = data.meetings.find((m) => m.id === id),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [share, setShare] = useState(false),
    [audioUrl, setAudioUrl] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (moment)
      setTimeout(
        () =>
          document
            .getElementById("segment-" + moment)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        100,
      );
  }, [moment, tab]);
  useEffect(() => {
    if (!m || demo) return;
    let url = "";
    fetch(API + "/api/meetings/" + id + "/audio", {
      headers: { Authorization: "Bearer " + getToken() },
      credentials: "include",
    })
      .then((r) => {
        if (r.ok) return r.blob();
        throw new Error();
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, demo]);
  if (!m)
    return (
      <Empty
        title="Meeting not found"
        body="This meeting may have been deleted or made private."
      />
    );
  const actions = data.actions.filter((a) => a.meetingId === id),
    selected = actions.filter(
      (a) =>
        filter === "All" ||
        (filter === "My items" && a.assignedTo === data.user.id) ||
        (filter === "Unassigned" && !a.assignedTo) ||
        (filter === "Completed" && a.status === "done"),
    );
  const speakers = Array.from(new Set(m.segments.map((s) => s.speaker)));
  const talk = speakers.map((name) => ({
    name,
    seconds: m.segments
      .filter((s) => s.speaker === name)
      .reduce((v, s) => v + s.endSec - s.startSec, 0),
  }));
  const totalTalk = talk.reduce((n, s) => n + s.seconds, 0);
  const exportText = `${m.title}\n${date(m.date)}\n\nSUMMARY\n${m.summary}\n\nKEY DECISIONS\n${m.keyDecisions.map((s) => "- " + s).join("\n")}\n\nACTION ITEMS\n${actions.map((a) => `- ${a.title} | ${data.members.find((u) => u.id === a.assignedTo)?.name || "Unassigned"} | ${date(a.dueDate)}`).join("\n")}\n\nTRANSCRIPT\n${m.segments.map((s) => `[${stamp(s.startSec)}] ${s.speaker}: ${s.text}`).join("\n")}`;
  return (
    <>
      <button className="back-link" onClick={() => go("meetings")}>
        <ArrowLeft size={14} />
        All meetings
      </button>
      <Heading
        eyebrow={
          m.source === "sample" || m.source?.startsWith("demo")
            ? "MEETING INTELLIGENCE · SAMPLE PREVIEW"
            : "MEETING INTELLIGENCE"
        }
        title={m.title}
        sub={`${date(m.date, { month: "long", day: "numeric", year: "numeric" })}   ·   ${minutes(m.durationSeconds)}   ·   ${m.participants.length} participants   ·   ${actions.length} action items`}
      >
        <button className="secondary" onClick={() => setShare(true)}>
          <Share2 size={15} />
          Share summary
        </button>
        <button
          className="secondary"
          onClick={() => {
            go("meetings/" + id + "/summary");
            setTimeout(() => window.print(), 250);
          }}
        >
          <Download size={15} />
          Export PDF
        </button>
        <button
          className="icon-button bordered"
          aria-label="Reprocess meeting"
          onClick={async () => {
            const r = await perform(
              "/meetings/" + id + "/reprocess",
              "POST",
              {},
              (d) => {
                const meeting = d.meetings.find((m) => m.id === id)!;
                meeting.status = "processing";
                meeting.stage = "extract";
                meeting.progress = 0;
              },
            );
            if (r !== null) go("processing/" + id);
          }}
        >
          <RotateCcw size={16} />
        </button>
      </Heading>
      <div className="result-meta">
        <Avatars names={m.participants} />
        <span>{m.participants.join(", ")}</span>
        <Badge tone={m.status === "completed" ? "green" : "amber"}>
          <CheckCircle2 size={12} />
          {m.status === "completed" ? "Processed" : m.status}
        </Badge>
        {m.isPrivate && (
          <Badge>
            <Lock size={11} />
            Private
          </Badge>
        )}
      </div>
      <div className="tabs">
        {[
          ["summary", "Summary", FileText],
          ["transcript", "Transcript", AudioLines],
          ["actions", "Action items", ListTodo],
          ["insights", "Insights", Activity],
        ].map(([key, label, Icon]: any) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => go("meetings/" + id + "/" + key)}
          >
            <Icon size={15} />
            {label}
            {key === "actions" && <span>{actions.length}</span>}
          </button>
        ))}
      </div>
      {tab === "actions" && (
        <>
          <div className="filter-pills">
            {["All", "My items", "Unassigned", "Completed"].map((f) => (
              <button
                key={f}
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="result-actions">
            {selected.map((a) => {
              const member = data.members.find((m) => m.id === a.assignedTo);
              return (
                <div
                  className={`result-action panel ${a.status === "done" ? "done" : ""}`}
                  key={a.id}
                >
                  <button
                    className={`checkbox ${a.status === "done" ? "checked" : ""}`}
                    aria-label={"Toggle " + a.title}
                    onClick={() =>
                      updateAction(a.id, {
                        status: a.status === "done" ? "todo" : "done",
                      })
                    }
                  >
                    {a.status === "done" && <Check size={12} />}
                  </button>
                  <div>
                    <button
                      className="action-title"
                      onClick={() => openAction(a.id)}
                    >
                      {a.title}
                    </button>
                    <div className="action-meta">
                      {member ? (
                        <>
                          <Avatar name={member.name} id={member.id} />
                          <span>{member.name}</span>
                        </>
                      ) : (
                        <span>Unassigned</span>
                      )}
                      <Due action={a} />
                      <Badge
                        tone={
                          a.priority === "high"
                            ? "red"
                            : a.priority === "medium"
                              ? "amber"
                              : "muted"
                        }
                      >
                        {a.priority} priority
                      </Badge>
                      <span className="confidence">
                        {Math.round(a.confidence * 100)}% confidence
                      </span>
                    </div>
                    {a.sourceQuote && (
                      <blockquote>
                        “{a.sourceQuote}”{" "}
                        <button
                          onClick={() =>
                            go(
                              `meetings/${id}/transcript/${a.sourceTimestampSec}`,
                            )
                          }
                        >
                          View in transcript <ArrowUpRight size={12} />
                        </button>
                      </blockquote>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label={"Open " + a.title}
                    onClick={() => openAction(a.id)}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
              );
            })}
            {!selected.length && (
              <Empty
                title="No action items here yet"
                body="Try another filter or create a manual action."
              />
            )}
          </div>
        </>
      )}
      {tab === "summary" && (
        <div className="summary-layout">
          <section className="panel padded">
            <div className="section-heading">
              <h2>
                <BrainCircuit size={18} />
                Meeting summary
              </h2>
              <Badge tone="cyan">{demo ? "Sample" : "AI generated"}</Badge>
            </div>
            <p className="summary-copy">
              {m.summary || "A summary will appear after processing."}
            </p>
            <hr />
            <h3>Key decisions</h3>
            <div className="decision-list">
              {m.keyDecisions.map((decision, i) => (
                <div key={decision}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>{decision}</p>
                </div>
              ))}
            </div>
          </section>
          <aside className="panel padded">
            <div className="eyebrow">TOPICS DISCUSSED</div>
            <div className="topic-tags">
              {m.topics.map((t) => (
                <Badge tone="cyan" key={t}>
                  {t}
                </Badge>
              ))}
            </div>
            <hr />
            <h3>Next steps</h3>
            <p>
              {actions.filter((a) => a.status !== "done").length} actions need
              follow-through.
            </p>
            <button
              className="secondary full"
              onClick={() => go("meetings/" + id + "/actions")}
            >
              Review action items <ArrowRight size={14} />
            </button>
            <button
              className="text-button"
              onClick={() => download("flowmind-summary.txt", exportText)}
            >
              Download text <Download size={13} />
            </button>
            <button
              className="text-button"
              onClick={async () => {
                if (demo) {
                  toast("Connect Notion in the live app to export a page.");
                  return;
                }
                try {
                  const r = await request(
                    "/meetings/" + id + "/notion",
                    "POST",
                  );
                  toast("Exported to Notion");
                  if (r.url) window.open(r.url, "_blank", "noopener");
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              Export to Notion <ArrowUpRight size={13} />
            </button>
          </aside>
        </div>
      )}
      {tab === "transcript" && (
        <section className="panel transcript-panel">
          <div className="transcript-toolbar">
            <div className="search-input">
              <Search size={15} />
              <input
                placeholder="Search this transcript…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search transcript"
              />
            </div>
            <button
              className="secondary"
              onClick={() =>
                download(
                  "flowmind-transcript.txt",
                  m.segments
                    .map(
                      (s) => `[${stamp(s.startSec)}] ${s.speaker}: ${s.text}`,
                    )
                    .join("\n"),
                )
              }
            >
              <Download size={14} />
              Export transcript
            </button>
          </div>
          {audioUrl && <audio ref={audio} controls src={audioUrl} />}
          <div className="transcript-list">
            {m.segments
              .filter(
                (s) =>
                  s.text.toLowerCase().includes(search.toLowerCase()) ||
                  s.speaker.toLowerCase().includes(search.toLowerCase()),
              )
              .map((s) => (
                <div
                  className={`transcript-segment ${moment === String(s.startSec) ? "highlighted" : ""}`}
                  key={s.startSec}
                  id={"segment-" + s.startSec}
                >
                  <button
                    className="timestamp"
                    onClick={() => {
                      if (audio.current) {
                        audio.current.currentTime = s.startSec;
                        audio.current.play().catch(() => {});
                      } else
                        toast(
                          demo
                            ? "Sample meeting audio is not included."
                            : "Audio playback is unavailable.",
                        );
                    }}
                  >
                    <Play size={10} />
                    {stamp(s.startSec)}
                  </button>
                  <Avatar
                    name={s.speaker}
                    id={"u" + speakers.indexOf(s.speaker)}
                  />
                  <div>
                    <strong>{s.speaker}</strong>
                    <p>{search ? highlight(s.text, search) : s.text}</p>
                  </div>
                </div>
              ))}
          </div>
          {!m.segments.length && (
            <Empty
              title="No transcript yet"
              body="Process the recording to generate a transcript."
            />
          )}
        </section>
      )}
      {tab === "insights" && (
        <div className="insights-grid">
          <section className="panel padded">
            <div className="section-heading">
              <h2>Who spoke, and how much?</h2>
              <Badge>Talk time</Badge>
            </div>
            {talk.map((s, i) => (
              <div className="talk-row" key={s.name}>
                <div>
                  <Avatar name={s.name} id={"u" + i} />
                  <strong>{s.name}</strong>
                  <span>
                    {totalTalk ? Math.round((s.seconds / totalTalk) * 100) : 0}%
                  </span>
                </div>
                <div className="progress-bar">
                  <span
                    style={{
                      width: `${totalTalk ? (s.seconds / totalTalk) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="field-help">
              Based on timestamped speaker segments. Whisper-only recordings
              have an unidentified speaker label.
            </p>
          </section>
          <section className="panel padded">
            <div className="eyebrow">MEETING HEALTH</div>
            <h2 className="large-value">
              {actions.length
                ? Math.round(
                    (actions.filter((a) => a.status === "done").length /
                      actions.length) *
                      100,
                  )
                : 0}
              %
            </h2>
            <p>Actions completed from this meeting</p>
            <hr />
            <h3>Compared with recent meetings</h3>
            <p>
              Typical duration:{" "}
              {minutes(
                data.meetings
                  .filter((other) => other.id !== id)
                  .slice(0, 10)
                  .reduce((total, other) => total + other.durationSeconds, 0) /
                  Math.max(
                    1,
                    data.meetings
                      .filter((other) => other.id !== id)
                      .slice(0, 10).length,
                  ),
              )}{" "}
              · This meeting: {minutes(m.durationSeconds)}
            </p>
            <hr />
            <h3>Conversation sentiment</h3>
            <Badge tone={m.sentiment === "positive" ? "green" : "muted"}>
              {m.sentiment || "Neutral"}
            </Badge>
            <div className="topic-tags">
              {m.topics.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </section>
        </div>
      )}
      {share && (
        <Modal
          title="Share meeting summary"
          sub="Copy or download a summary to share with your team."
          onClose={() => setShare(false)}
        >
          <textarea
            className="share-text"
            readOnly
            value={exportText.slice(0, 5000)}
            rows={10}
          />
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => download("flowmind-summary.txt", exportText)}
            >
              <Download size={15} />
              Download
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportText);
                  toast("Summary copied");
                  setShare(false);
                } catch {
                  toast("Copy the text from the field above.");
                }
              }}
            >
              <Copy size={15} />
              Copy summary
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
