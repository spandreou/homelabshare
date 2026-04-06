export type AuthActionState = {
  error: string | null;
};

export type FileActionState = {
  error: string | null;
  success: string | null;
};

export type InviteRequestActionState = {
  error: string | null;
  success: string | null;
};

export type ManualInviteState = {
  error: string | null;
  success: string | null;
  code: string | null;
  email: string | null;
  expiresAt: string | null;
};

export type ShareLinkState = {
  error: string | null;
  url: string | null;
  expiresAt: string | null;
};

export const initialAuthState: AuthActionState = { error: null };
export const initialFileState: FileActionState = { error: null, success: null };
export const initialInviteRequestState: InviteRequestActionState = {
  error: null,
  success: null,
};

export const initialManualInviteState: ManualInviteState = {
  error: null,
  success: null,
  code: null,
  email: null,
  expiresAt: null,
};

export const initialShareLinkState: ShareLinkState = {
  error: null,
  url: null,
  expiresAt: null,
};
