/**
 * A getSession() result is only safe to apply if no SIGNED_IN or SIGNED_OUT
 * event occurred while the asynchronous startup check was pending.
 */
export function isInitialSessionSnapshotCurrent(snapshotRevision, currentRevision) {
  return Number.isInteger(snapshotRevision)
    && Number.isInteger(currentRevision)
    && snapshotRevision === currentRevision;
}
