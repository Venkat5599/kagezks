/**
 * Input validation utilities for Stellar addresses, contract IDs, and amounts.
 */
import { StrKey } from "@stellar/stellar-sdk";

export interface ValidationResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
}

/** Validate a Stellar public key (G... address). */
export function validateStellarAddress(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "Address is required" };
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    return { valid: false, error: "Invalid Stellar public key (expected G… format)" };
  }
  return { valid: true, sanitized: trimmed };
}

/** Validate a Stellar contract ID (C... format). */
export function validateContractId(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "Contract ID is required" };
  if (!StrKey.isValidContract(trimmed)) {
    return { valid: false, error: "Invalid contract ID (expected C… format)" };
  }
  return { valid: true, sanitized: trimmed };
}

/** Validate a positive integer amount string. */
export function validateAmount(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "Amount is required" };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return { valid: false, error: "Amount must be a positive number" };
  }
  if (n > 1_000_000_000_000) {
    return { valid: false, error: "Amount exceeds maximum (1 trillion)" };
  }
  return { valid: true, sanitized: trimmed };
}

/** Validate an email address format. */
export function validateEmail(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "Email is required" };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Invalid email format" };
  }
  return { valid: true, sanitized: trimmed.toLowerCase() };
}
