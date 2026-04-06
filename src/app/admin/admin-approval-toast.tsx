"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

export function AdminApprovalToast({
  approved,
  resent,
  mailSent,
  inviteDeleted,
  deleted,
  cleanupCount,
}: {
  approved: boolean;
  resent: boolean;
  mailSent: boolean;
  inviteDeleted: boolean;
  deleted: "ok" | "self" | null;
  cleanupCount: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!approved) {
      return;
    }

    if (mailSent) {
      toast.success("Invite code approved and sent successfully.");
    } else {
      toast("Invite approved, but email could not be sent. Configure SMTP and resend manually.");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("approved");
    params.delete("mail");
    const next = params.toString();

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [approved, mailSent, pathname, router, searchParams]);

  useEffect(() => {
    if (!resent) {
      return;
    }

    if (mailSent) {
      toast.success("Invite email resent successfully.");
    } else {
      toast.error("Resend failed. Check SMTP settings and try again.");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("resent");
    params.delete("mail");
    const next = params.toString();

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [resent, mailSent, pathname, router, searchParams]);

  useEffect(() => {
    if (!inviteDeleted) {
      return;
    }

    toast.success("Invite request deleted.");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("inviteDeleted");
    const next = params.toString();

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [inviteDeleted, pathname, router, searchParams]);

  useEffect(() => {
    if (!deleted) {
      return;
    }

    if (deleted === "self") {
      toast.error("You cannot delete your own admin account.");
    } else {
      toast.success("User and all files were deleted.");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("deleted");
    const next = params.toString();

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [deleted, pathname, router, searchParams]);

  useEffect(() => {
    if (cleanupCount === null) {
      return;
    }

    if (cleanupCount === 0) {
      toast("No orphaned files found.");
    } else {
      toast.success(`Cleanup finished. Removed ${cleanupCount} orphaned file(s).`);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("cleanup");
    const next = params.toString();

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [cleanupCount, pathname, router, searchParams]);

  return null;
}
