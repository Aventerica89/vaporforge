import { jwtVerify, createRemoteJWKSet } from 'jose';

export interface CfAccessIdentity {
  email: string;
  sub: string;
  country?: string;
}

// Cache JWKS keyset in module scope — survives across requests within
// the same Worker isolate. Avoids 50-200ms JWKS fetch on every request.
// Keys rotate every 6 weeks with 7-day overlap; isolates are short-lived
// enough that stale keys are rare. On verification failure we could
// rebuild the keyset, but jose's createRemoteJWKSet handles kid-based
// key selection and internal caching already.
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedTeamDomain: string | null = null;

function getJWKS(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJWKS && cachedTeamDomain === teamDomain) return cachedJWKS;
  cachedJWKS = createRemoteJWKSet(
    new URL(`${teamDomain}/cdn-cgi/access/certs`)
  );
  cachedTeamDomain = teamDomain;
  return cachedJWKS;
}

/**
 * Validate a Cloudflare Access JWT from the Cf-Access-Jwt-Assertion header.
 * Returns the user identity or null if validation fails.
 *
 * CF docs: https://developers.cloudflare.com/cloudflare-one/access-controls/
 *          applications/http-apps/authorization-cookie/validating-json/
 */
export async function validateCfAccessJwt(
  request: Request,
  teamDomain: string,
  policyAud: string,
): Promise<CfAccessIdentity | null> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  try {
    const JWKS = getJWKS(teamDomain);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: teamDomain,
      audience: policyAud,
    });

    if (!payload.email || !payload.sub) return null;

    return {
      email: payload.email as string,
      sub: payload.sub,
      country: payload.country as string | undefined,
    };
  } catch {
    return null;
  }
}
