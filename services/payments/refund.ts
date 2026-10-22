export async function refundPayment(
  base: string,
  appId: string,
  appSecret: string,
  refund: { paymentId: string; amount: number; reason: string },
  request: typeof fetch = fetch,
): Promise<string> {
  const tokenResponse = await request(`${base}/merchant/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(appId + ":" + appSecret).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenResponse.ok || !token.access_token)
    throw new Error("Refund authorization failed");
  const response = await request(`${base}/merchant/v1/payment/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_id: refund.paymentId,
      description: refund.reason,
      amount: Number(refund.amount).toFixed(2),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await response.json()) as {
    status: number;
    data?: string | number;
  };
  if (!response.ok || data.status !== 1 || !data.data)
    throw new Error("Refund needs review");
  return String(data.data);
}
