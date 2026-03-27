import type {
  AuthComponentSession,
  AuthComponentUser,
  GetSessionWithUserResult,
} from "./index.js";

export function isSessionActive(
  session: Pick<AuthComponentSession, "expiresAt"> | null | undefined,
  now: number
): session is Pick<AuthComponentSession, "expiresAt"> {
  return Boolean(session && session.expiresAt > now);
}

export function resolveSessionWithUser(args: {
  session: AuthComponentSession | null;
  user: AuthComponentUser | null;
  now: number;
}): GetSessionWithUserResult {
  const { session, user, now } = args;

  if (!session) {
    return { session: null, user: null };
  }

  if (!isSessionActive(session, now)) {
    return { session: null, user: null };
  }

  if (!user || user.id !== session.userId) {
    return { session: null, user: null };
  }

  return { session, user };
}
