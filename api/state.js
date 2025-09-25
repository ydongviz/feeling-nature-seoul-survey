// /api/state.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "us-east-2";
const BUCKET = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET;
const s3 = new S3Client({ region: REGION });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Require the event key header
  const EXPECT = process.env.EVENT_KEY;
  const got = req.headers["x-event-key"];
  if (!EXPECT || got !== EXPECT) {
     return res.status(403).json({ ok:false, error:"forbidden" });
  }

  try {
    const { stage, session_id, overlay, ttl_seconds } = req.body || {};
    if (!stage) return res.status(400).json({ ok: false, error: "stage required" });

    const now = new Date();
    // Sensible defaults per stage
    const ttl = Number.isFinite(ttl_seconds)
      ? ttl_seconds
      : stage === "in_progress" ? 180
      : stage === "show_result" ? 300
      : 120;

    const payload = {
      stage,
      session_id: session_id || "",
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
      ...(overlay ? { overlay } : {})
    };

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: "public/runtime/state.json",
      Body: JSON.stringify(payload),
      ContentType: "application/json",
      // Cache-Control ensures TVs revalidate (ETag) instead of getting stale cached copies
      CacheControl: "no-cache, must-revalidate"
      // NOTE: no ACL here; your bucket policy already allows public GET on this path
    }));

    res.json({ ok: true, state: payload });
  } catch (err) {
    console.error("state write failed:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
}
