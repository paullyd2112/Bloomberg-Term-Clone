const API_KEY        = process.env.BEEHIIV_API_KEY ?? "";
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID ?? "";
const BASE           = "https://api.beehiiv.com/v2";

/**
 * Syncs an email to the Beehiiv subscriber list.
 * Best-effort — never throws; logs on failure.
 */
export async function syncToBeehiiv(
  email: string,
  utmSource: "newsletter" | "app" = "app",
): Promise<void> {
  if (!API_KEY || !PUBLICATION_ID) return;

  try {
    const res = await fetch(`${BASE}/publications/${PUBLICATION_ID}/subscriptions`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email:  false,
        utm_source:          utmSource,
        referring_site:      "plebs.finance",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`beehiiv sync failed [${res.status}]:`, text);
    }
  } catch (err) {
    console.error("beehiiv sync error:", err);
  }
}
