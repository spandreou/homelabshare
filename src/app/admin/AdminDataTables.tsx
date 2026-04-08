"use client";

import { useMemo, useState } from "react";
import {
  approveInviteRequest,
  deleteInviteRequest,
  resendInviteEmail,
  deleteUserByAdminAction,
} from "../actions";
import { DeleteUserForm } from "./delete-user-form";
import { FormSubmitButton } from "./form-submit-button";

type InviteRequestRow = {
  id: string;
  username: string;
  email: string;
  status: "PENDING" | "APPROVED";
  inviteCode: string | null;
  emailStatus: "NOT_SENT" | "SENT" | "FAILED";
  emailError: string | null;
  emailSentAt: string | null;
  createdAt: string;
};

type UserRow = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  storageUsed: string;
  filesCount: number;
  createdAt: string;
};

type RecentLogRow = {
  id: string;
  action: "UPLOAD" | "DELETE" | "DOWNLOAD" | "SHARE" | "LOGIN" | "LOGOUT";
  fileName: string;
  userEmail: string;
  timestamp: string;
};

function formatBytes(value: bigint) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function InviteStatusBadge({ request }: { request: InviteRequestRow }) {
  if (request.emailStatus === "SENT") {
    return <span className="rounded-full bg-green-900/40 px-2 py-1 text-xs font-semibold text-green-300">Approved</span>;
  }
  if (request.emailStatus === "FAILED") {
    return <span className="rounded-full bg-amber-900/40 px-2 py-1 text-xs font-semibold text-amber-300">Retry Needed</span>;
  }
  return <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-300">Pending</span>;
}

function UserStatusBadge({ isAdmin, isActive }: { isAdmin: boolean; isActive: boolean }) {
  if (isAdmin) {
    return <span className="rounded-full bg-blue-900/40 px-2 py-1 text-xs font-semibold text-blue-300">Admin</span>;
  }
  if (isActive) {
    return <span className="rounded-full bg-green-900/40 px-2 py-1 text-xs font-semibold text-green-300">Active</span>;
  }
  return <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-300">Idle</span>;
}

export function AdminDataTables({
  inviteRequests,
  users,
  recentLogs,
  adminUserId,
  activeUserIds,
}: {
  inviteRequests: InviteRequestRow[];
  users: UserRow[];
  recentLogs: RecentLogRow[];
  adminUserId: string;
  activeUserIds: string[];
}) {
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteSort, setInviteSort] = useState<"newest" | "oldest" | "email">("newest");

  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"newest" | "oldest" | "storage" | "files">("newest");

  const [logSearch, setLogSearch] = useState("");
  const [logSort, setLogSort] = useState<"newest" | "oldest" | "action">("newest");

  const filteredInvites = useMemo(() => {
    const term = inviteSearch.trim().toLowerCase();
    const rows = inviteRequests.filter((row) => {
      if (!term) return true;
      return (
        row.username.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        (row.inviteCode ?? "").toLowerCase().includes(term)
      );
    });

    return [...rows].sort((a, b) => {
      if (inviteSort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (inviteSort === "email") return a.email.localeCompare(b.email);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [inviteRequests, inviteSearch, inviteSort]);

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    const rows = users.filter((row) => (term ? row.email.toLowerCase().includes(term) : true));

    return [...rows].sort((a, b) => {
      if (userSort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (userSort === "storage") {
        const left = BigInt(a.storageUsed);
        const right = BigInt(b.storageUsed);
        if (right === left) return 0;
        return right > left ? 1 : -1;
      }
      if (userSort === "files") return b.filesCount - a.filesCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [users, userSearch, userSort]);

  const filteredLogs = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    const rows = recentLogs.filter((row) => {
      if (!term) return true;
      return (
        row.fileName.toLowerCase().includes(term) ||
        row.userEmail.toLowerCase().includes(term) ||
        row.action.toLowerCase().includes(term)
      );
    });

    return [...rows].sort((a, b) => {
      if (logSort === "oldest") return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (logSort === "action") return a.action.localeCompare(b.action);
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [recentLogs, logSearch, logSort]);

  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Invite Requests</h2>
          <div className="grid gap-2 sm:grid-cols-[240px_180px]">
            <input
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder="Search username/email/code..."
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <select
              value={inviteSort}
              onChange={(event) => setInviteSort(event.target.value as typeof inviteSort)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="email">Email A-Z</option>
            </select>
          </div>
        </div>

        {filteredInvites.length === 0 ? (
          <p className="text-zinc-400">No invite requests match current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="pb-3">Username</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Code</th>
                  <th className="pb-3">Requested</th>
                  <th className="pb-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvites.map((request) => (
                  <tr key={request.id} className="border-b border-zinc-900/70">
                    <td className="py-3 pr-4">{request.username}</td>
                    <td className="py-3 pr-4 text-zinc-300">{request.email}</td>
                    <td className="py-3 pr-4">
                      <InviteStatusBadge request={request} />
                      {request.emailError ? <p className="mt-1 text-xs text-zinc-500">{request.emailError}</p> : null}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-green-300">{request.inviteCode ?? "-"}</td>
                    <td className="py-3 pr-4 text-zinc-400">{new Date(request.createdAt).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {request.emailStatus === "SENT" ? (
                          <button type="button" disabled className="rounded-md bg-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200">
                            Approved
                          </button>
                        ) : request.emailStatus === "FAILED" ? (
                          <form action={resendInviteEmail.bind(null, request.id)} className="inline-block">
                            <FormSubmitButton
                              idleLabel="Resend"
                              pendingLabel="Sending..."
                              className="rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </form>
                        ) : (
                          <form action={approveInviteRequest.bind(null, request.id)} className="inline-block">
                            <FormSubmitButton
                              idleLabel="Approve"
                              pendingLabel="Approving..."
                              className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </form>
                        )}

                        <form action={deleteInviteRequest.bind(null, request.id)} className="inline-block">
                          <FormSubmitButton
                            idleLabel="Delete"
                            pendingLabel="Deleting..."
                            className="rounded-md border border-red-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-300 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Manage Users</h2>
          <div className="grid gap-2 sm:grid-cols-[220px_180px]">
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search user email..."
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <select
              value={userSort}
              onChange={(event) => setUserSort(event.target.value as typeof userSort)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="storage">Storage high-low</option>
              <option value="files">Files high-low</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="pb-3">Email</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Files</th>
                <th className="pb-3">Storage</th>
                <th className="pb-3">Created</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isSelf = user.id === adminUserId;
                const isActive = activeUserIds.includes(user.id);
                return (
                  <tr key={user.id} className="border-b border-zinc-900/70">
                    <td className="py-3 pr-4">{user.email}</td>
                    <td className="py-3 pr-4">
                      <UserStatusBadge isAdmin={isSelf || user.role === "ADMIN"} isActive={isActive} />
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{user.filesCount}</td>
                    <td className="py-3 pr-4 text-zinc-300">{formatBytes(BigInt(user.storageUsed))}</td>
                    <td className="py-3 pr-4 text-zinc-400">{new Date(user.createdAt).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-zinc-500">Current Admin</span>
                      ) : (
                        <DeleteUserForm action={deleteUserByAdminAction.bind(null, user.id)} email={user.email} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <div className="grid gap-2 sm:grid-cols-[230px_160px]">
            <input
              value={logSearch}
              onChange={(event) => setLogSearch(event.target.value)}
              placeholder="Search file/user/action..."
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <select
              value={logSort}
              onChange={(event) => setLogSort(event.target.value as typeof logSort)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-green-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="action">Action A-Z</option>
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-zinc-400">No activity matches current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="pb-3">Action</th>
                  <th className="pb-3">File Name</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((entry) => (
                  <tr key={entry.id} className="border-b border-zinc-900/70">
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          entry.action === "UPLOAD"
                            ? "bg-green-900/40 text-green-300"
                            : entry.action === "DELETE"
                              ? "bg-red-900/40 text-red-300"
                              : entry.action === "DOWNLOAD"
                                ? "bg-blue-900/40 text-blue-300"
                                : entry.action === "SHARE"
                                  ? "bg-amber-900/40 text-amber-300"
                                  : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{entry.fileName}</td>
                    <td className="py-3 pr-4 text-zinc-300">{entry.userEmail}</td>
                    <td className="py-3 pr-4 text-zinc-400">{new Date(entry.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
