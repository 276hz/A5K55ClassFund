import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername, usernameToAuthEmail } from "../src/lib/auth-identity";

describe("username authentication identity", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeUsername("  ThuyDung ")).toBe("thuydung");
    expect(usernameToAuthEmail(" ThuyDung ")).toBe("thuydung@login.classfund.invalid");
  });
  it("accepts only lowercase-safe account names", () => {
    expect(isValidUsername("thuydung")).toBe(true);
    expect(isValidUsername("thuy_trang2")).toBe(true);
    expect(isValidUsername("a@b.com")).toBe(false);
    expect(isValidUsername("../admin")).toBe(false);
    expect(isValidUsername("2abc")).toBe(false);
  });
  it("does not turn arbitrary input into an auth email", () => {
    expect(usernameToAuthEmail("not valid" )).toBeNull();
  });
});
