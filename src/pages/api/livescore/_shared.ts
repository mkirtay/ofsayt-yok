const API_BASE_URL = "https://livescore-api.com/api-client";

export const getAuthParams = () => {
  const key = process.env.LIVESCORE_API_KEY;
  const secret = process.env.LIVESCORE_API_SECRET;

  if (!key || !secret) {
    throw new Error("Missing LiveScore API credentials");
  }

  return { key, secret };
};

export const buildApiUrl = (
  endpoint: string,
  params: Record<string, string | number | undefined>
) => {
  const { key, secret } = getAuthParams();
  const url = new URL(`${API_BASE_URL}/${endpoint}`);
  url.searchParams.set("key", key);
  url.searchParams.set("secret", secret);

  Object.entries(params).forEach(([paramKey, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(paramKey, String(value));
    }
  });

  return url.toString();
};
