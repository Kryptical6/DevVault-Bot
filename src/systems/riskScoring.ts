// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — RISK SCORING
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js';

/** Returns true if the LFD payment exceeds the proof-of-funds threshold. */
export function assessLFDRisk(paymentType: string, paymentAmount: string): boolean {
  const amount = parseFloat(paymentAmount);
  if (isNaN(amount)) return false;
  if (paymentType.toLowerCase() === 'robux' && amount > config.proofOfFundsThresholdRobux) return true;
  if (paymentType.toLowerCase() === 'usd'   && amount > config.proofOfFundsThresholdUSD)   return true;
  return false;
}
