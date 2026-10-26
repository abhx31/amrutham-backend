import crypto from "node:crypto";

const prefix = "amrutam:cache:v1";

export const doctorCacheKeys = {
  listVersion: `${prefix}:doctors:list:version`,
  list: (version: number, input: unknown) => `${prefix}:doctors:list:${version}:${hash(input)}`,
  profileVersion: (doctorId: string) => `${prefix}:doctor:${doctorId}:profile:version`,
  profile: (doctorId: string, version: number) => `${prefix}:doctor:${doctorId}:profile:${version}`,
  availabilityVersion: (doctorId: string) => `${prefix}:doctor:${doctorId}:availability:version`,
  availability: (doctorId: string, version: number, input: unknown) =>
    `${prefix}:doctor:${doctorId}:availability:${version}:${hash(input)}`
};

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value, (_key, item: unknown) => {
    return item instanceof Date ? item.toISOString() : item;
  })).digest("base64url").slice(0, 24);
}
