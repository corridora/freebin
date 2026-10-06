export const DEFAULT_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const ANONYMOUS_STORAGE_LIMIT_BYTES = 1024 * 1024;

export function byteLength(...values: Array<string | null | undefined>) {
  const encoder = new TextEncoder();
  return values.reduce(
    (total, value) => total + encoder.encode(value || "").byteLength,
    0,
  );
}

export async function enforceStorageLimit(
  db: D1Database,
  binId: string,
  limitOverride?: number,
) {
  const bin = await db
    .prepare("SELECT user_id AS userId FROM bins WHERE id = ?")
    .bind(binId)
    .first<{ userId: string | null }>();

  if (bin?.userId) {
    const user = await db
      .prepare(
        "SELECT storage_limit_bytes AS storageLimitBytes FROM users WHERE id = ?",
      )
      .bind(bin.userId)
      .first<{ storageLimitBytes: number }>();
    const limit =
      limitOverride ||
      Number(user?.storageLimitBytes) ||
      DEFAULT_STORAGE_LIMIT_BYTES;
    const usage = await db
      .prepare(
        `
      SELECT
        COALESCE((SELECT SUM(r.size_bytes) FROM requests r JOIN bins b ON b.id = r.bin_id WHERE b.user_id = ?), 0) +
        COALESCE((SELECT SUM(ra.size_bytes) FROM replay_attempts ra JOIN bins b ON b.id = ra.bin_id WHERE b.user_id = ?), 0) AS bytes
    `,
      )
      .bind(bin.userId, bin.userId)
      .first<{ bytes: number }>();
    let over = Number(usage?.bytes) - limit;
    if (over <= 0) return;
    await db
      .prepare(
        `DELETE FROM replay_attempts WHERE id IN (
      SELECT id FROM (SELECT ra.id, ra.size_bytes,
        SUM(ra.size_bytes) OVER (ORDER BY ra.created_at ASC, ra.id ASC) AS cumulative_bytes
        FROM replay_attempts ra JOIN bins b ON b.id = ra.bin_id WHERE b.user_id = ?)
      WHERE cumulative_bytes - size_bytes < ?
    )`,
      )
      .bind(bin.userId, over)
      .run();
    const replayUsage = await db
      .prepare(
        "SELECT COALESCE(SUM(ra.size_bytes), 0) AS bytes FROM replay_attempts ra JOIN bins b ON b.id = ra.bin_id WHERE b.user_id = ?",
      )
      .bind(bin.userId)
      .first<{ bytes: number }>();
    const requestUsage = await db
      .prepare(
        "SELECT COALESCE(SUM(r.size_bytes), 0) AS bytes FROM requests r JOIN bins b ON b.id = r.bin_id WHERE b.user_id = ?",
      )
      .bind(bin.userId)
      .first<{ bytes: number }>();
    over = Number(replayUsage?.bytes) + Number(requestUsage?.bytes) - limit;
    if (over <= 0) return;
    await db
      .prepare(
        `
      DELETE FROM requests WHERE id IN (
        SELECT id FROM (
          SELECT r.id, r.size_bytes,
            SUM(r.size_bytes) OVER (ORDER BY r.created_at ASC, r.id ASC) AS cumulative_bytes
          FROM requests r JOIN bins b ON b.id = r.bin_id WHERE b.user_id = ?
        ) WHERE cumulative_bytes - size_bytes < ?
      )
    `,
      )
      .bind(bin.userId, over)
      .run();
    return;
  }

  const usage = await db
    .prepare(
      `SELECT
    COALESCE((SELECT SUM(size_bytes) FROM requests WHERE bin_id = ?), 0) +
    COALESCE((SELECT SUM(size_bytes) FROM replay_attempts WHERE bin_id = ?), 0) AS bytes`,
    )
    .bind(binId, binId)
    .first<{ bytes: number }>();
  let over = Number(usage?.bytes) - ANONYMOUS_STORAGE_LIMIT_BYTES;
  if (over <= 0) return;
  await db
    .prepare(
      `DELETE FROM replay_attempts WHERE id IN (
    SELECT id FROM (SELECT id, size_bytes, SUM(size_bytes) OVER (ORDER BY created_at ASC, id ASC) AS cumulative_bytes
      FROM replay_attempts WHERE bin_id = ?) WHERE cumulative_bytes - size_bytes < ?
  )`,
    )
    .bind(binId, over)
    .run();
  const replayUsage = await db
    .prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM replay_attempts WHERE bin_id = ?",
    )
    .bind(binId)
    .first<{ bytes: number }>();
  const requestUsage = await db
    .prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM requests WHERE bin_id = ?",
    )
    .bind(binId)
    .first<{ bytes: number }>();
  over =
    Number(replayUsage?.bytes) +
    Number(requestUsage?.bytes) -
    ANONYMOUS_STORAGE_LIMIT_BYTES;
  if (over <= 0) return;
  await db
    .prepare(
      `
    DELETE FROM requests WHERE id IN (
      SELECT id FROM (
        SELECT id, size_bytes,
          SUM(size_bytes) OVER (ORDER BY created_at ASC, id ASC) AS cumulative_bytes
        FROM requests WHERE bin_id = ?
      ) WHERE cumulative_bytes - size_bytes < ?
    )
  `,
    )
    .bind(binId, over)
    .run();
}
