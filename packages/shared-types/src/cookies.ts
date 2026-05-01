import { z } from 'zod';

/**
 * Swiggy session cookies extracted via OTP login.
 *
 * `_session_tid`, `tid`, `sid` are the auth-bearing cookies set by
 * `dapi/auth/otp-verify` on success. `userLocation` is optionally set after
 * the user picks a delivery address. Treat all values as secrets.
 */
export const SwiggyAuthCookiesSchema = z
  .object({
    _session_tid: z.string().min(1),
    tid: z.string().min(1),
    sid: z.string().min(1),
    userLocation: z.string().optional(),
    capturedAt: z.string().datetime({ offset: true }),
    phoneLast4: z.string().regex(/^\d{4}$/, 'must be 4 digits'),
  })
  .strict();

export type SwiggyAuthCookies = z.infer<typeof SwiggyAuthCookiesSchema>;

export const PhoneNumberSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Indian mobile number, 10 digits, starts with 6-9');
export type PhoneNumber = z.infer<typeof PhoneNumberSchema>;

export const OtpCodeSchema = z.string().regex(/^\d{4,6}$/, 'OTP must be 4-6 digits');
export type OtpCode = z.infer<typeof OtpCodeSchema>;
