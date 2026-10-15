const encoder = new TextEncoder();
export async function onRequestGet({ env }) {
  if (!env.LIVE_SECRET) {
    return Response.json({ error: "Live sync not configured" }, { status: 503 });
  }
  let worker;
  try {
    worker = new URL("https://whiteboard-live.aryamwithmohammad.workers.dev/");
    if (worker.protocol !== "https:" || !worker.hostname.endsWith(".workers.dev") && !worker.hostname.endsWith(".cloudflareworkers.com")) throw Error("Invalid worker URL");
  } catch {
    return Response.json({ error: "Invalid live worker URL" }, { status: 503 });
  }
  const expires = String(Date.now() + 60000);
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.LIVE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode("shared:" + expires));
  const signature = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  worker.protocol = "wss:";
  worker.pathname = "/live";
  worker.search = "";
  worker.searchParams.set("ticket", expires + "." + signature);
  return Response.json({ url: worker.toString() }, { headers: { "Cache-Control": "no-store" } });
}
