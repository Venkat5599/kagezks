import { describe, it, expect } from "vitest";
import {
  validateStellarAddress,
  validateContractId,
  validateAmount,
  validateEmail,
} from "@/lib/validation";

describe("validateStellarAddress", () => {
  it("accepts a valid Stellar public key", () => {
    const result = validateStellarAddress(
      "GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y"
    );
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBeDefined();
  });

  it("rejects empty input", () => {
    const result = validateStellarAddress("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Address is required");
  });

  it("rejects invalid format", () => {
    const result = validateStellarAddress("not-a-key");
    expect(result.valid).toBe(false);
  });

  it("rejects contract ID as address", () => {
    const result = validateStellarAddress(
      "CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC"
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateContractId", () => {
  it("accepts a valid contract ID", () => {
    const result = validateContractId(
      "CCQWGM2CBTFTY4B3OTKNTQO3GMBJUHWTJOSU7NC2QRDZ26KCSMJQGJXC"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects empty input", () => {
    const result = validateContractId("");
    expect(result.valid).toBe(false);
  });

  it("rejects a plain public key as contract ID", () => {
    const result = validateContractId(
      "GAR3JTLVA4G4AHCRRQGVP4PPIXETEF3RXK2JT3F5PHZQD33FEDONMI2Y"
    );
    expect(result.valid).toBe(false);
  });
});

describe("validateAmount", () => {
  it("accepts a positive integer", () => {
    const result = validateAmount("10000000");
    expect(result.valid).toBe(true);
  });

  it("rejects zero", () => {
    const result = validateAmount("0");
    expect(result.valid).toBe(false);
  });

  it("rejects negative", () => {
    const result = validateAmount("-5");
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric", () => {
    const result = validateAmount("abc");
    expect(result.valid).toBe(false);
  });

  it("rejects amounts above 1 trillion", () => {
    const result = validateAmount("2000000000000");
    expect(result.valid).toBe(false);
  });
});

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    const result = validateEmail("user@example.com");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe("user@example.com");
  });

  it("lowercases the email", () => {
    const result = validateEmail("User@Example.COM");
    expect(result.sanitized).toBe("user@example.com");
  });

  it("rejects empty", () => {
    const result = validateEmail("");
    expect(result.valid).toBe(false);
  });

  it("rejects invalid format", () => {
    const result = validateEmail("not-an-email");
    expect(result.valid).toBe(false);
  });

  it("rejects missing domain", () => {
    const result = validateEmail("user@");
    expect(result.valid).toBe(false);
  });
});
