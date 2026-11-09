export const API = process.env.NEXT_PUBLIC_API_URL || "";
let token = "";
let refreshing: Promise<boolean> | null = null;
export const setToken = (v: string) => {
  token = v;
};
export const getToken = () => token;
async function refresh() {
  if (!refreshing)
    refreshing = fetch(API + "/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return false;
        token = (await r.json()).accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function request<T = any>(
  path: string,
  method = "GET",
  body?: any,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(API + "/api" + path, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401 && retry && (await refresh()))
    return request(path, method, body, false);
  if (!r.ok) {
    const b = await r.json().catch(() => ({ message: r.statusText }));
    throw new Error(
      typeof b.message === "string" ? b.message : JSON.stringify(b.message),
    );
  }
  return r.json();
}
export async function uploadFile(
  meetingId: string,
  file: File,
  onProgress: (n: number) => void,
) {
  const key = `fm-upload:${meetingId}:${file.name}:${file.size}`;
  let id = localStorage.getItem(key);
  let offset = 0;
  if (id) {
    try {
      offset = (await request("/uploads/" + id)).offset;
    } catch {
      id = null;
    }
  }
  if (!id) {
    const u = await request("/meetings/" + meetingId + "/uploads", "POST", {
      filename: file.name,
      size: file.size,
    });
    id = u.id;
    localStorage.setItem(key, id!);
  }
  while (offset < file.size) {
    const end = Math.min(offset + 5 * 1024 ** 2, file.size);
    let success = false;
    for (let attempt = 0; attempt < 4 && !success; attempt++) {
      try {
        const r = await fetch(API + "/api/uploads/" + id, {
          method: "PATCH",
          credentials: "include",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/octet-stream",
            "Upload-Offset": String(offset),
          },
          body: file.slice(offset, end),
        });
        if (r.status === 409) {
          offset = (await request("/uploads/" + id)).offset;
          success = true;
          continue;
        }
        if (r.status === 401) {
          await refresh();
          continue;
        }
        if (!r.ok) throw new Error("Upload failed: " + r.status);
        offset = (await r.json()).offset;
        success = true;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    if (!success)
      throw new Error("Upload interrupted. Submit again to resume.");
    onProgress(Math.round((offset / file.size) * 100));
  }
  await request("/uploads/" + id + "/complete", "POST");
  localStorage.removeItem(key);
}
export function download(name: string, contents: string, type = "text/plain") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([contents], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
