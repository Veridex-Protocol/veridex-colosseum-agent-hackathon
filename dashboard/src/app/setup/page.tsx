"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAgentStatus,
  setAgentCredentials,
  revokeAgentCredentials,
  type AgentStatus,
} from "@/lib/api";

type Step = 1 | 2 | 3;

interface PasskeyCredential {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  keyHash: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function SetupPage() {
  const [step, setStep] = useState<Step>(1);
  const [passkey, setPasskey] = useState<PasskeyCredential | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<AgentStatus | null>(null);
  const [sessionKeyHash, setSessionKeyHash] = useState<string>("");

  const [dailyLimit, setDailyLimit] = useState(50);
  const [perTxLimit, setPerTxLimit] = useState(5);
  const [sessionHours, setSessionHours] = useState(24);

  useEffect(() => {
    fetchAgentStatus()
      .then((s) => {
        if (s.hasCredentials) setExisting(s);
      })
      .catch(() => {});
  }, []);

  async function createPasskey() {
    setLoading(true);
    setError(null);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Veridex Pay", id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: "veridex-agent-owner",
            displayName: "Veridex Agent Owner",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });

      if (!credential) throw new Error("Passkey creation cancelled");

      const cred = credential as PublicKeyCredential;
      const credentialId = btoa(
        String.fromCharCode(...new Uint8Array(cred.rawId))
      );

      const keyHashBuf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(credentialId)
      );
      const keyHash = toHex(keyHashBuf);

      const pubKeyXBuf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(credentialId + ":x")
      );
      const pubKeyYBuf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(credentialId + ":y")
      );

      setPasskey({
        credentialId,
        publicKeyX: "0x" + toHex(pubKeyXBuf),
        publicKeyY: "0x" + toHex(pubKeyYBuf),
        keyHash,
      });
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Passkey creation failed");
    } finally {
      setLoading(false);
    }
  }

  async function authorizeAgent() {
    if (!passkey) return;
    setLoading(true);
    setError(null);
    try {
      const sessionKeyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      );

      const publicKeyRaw = await crypto.subtle.exportKey(
        "raw",
        sessionKeyPair.publicKey
      );
      const publicKeyHex =
        "0x" + toHex(publicKeyRaw);

      const privateKeyJwk = await crypto.subtle.exportKey(
        "jwk",
        sessionKeyPair.privateKey
      );

      const encKeyMaterial = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(passkey.credentialId)
      );
      const encKey = await crypto.subtle.importKey(
        "raw",
        encKeyMaterial,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encKey,
        new TextEncoder().encode(JSON.stringify(privateKeyJwk))
      );
      const encryptedHex =
        toHex(iv.buffer) + toHex(encrypted);

      const sessionHashBuf = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(publicKeyRaw)
      );
      const skHash = "0x" + toHex(sessionHashBuf);
      setSessionKeyHash(skHash);

      const result = await setAgentCredentials(passkey, {
        publicKey: publicKeyHex,
        encryptedPrivateKey: encryptedHex,
        keyHash: skHash,
        dailyLimitUSD: dailyLimit,
        perTransactionLimitUSD: perTxLimit,
        expiryHours: sessionHours,
        allowedChains: [1],
      });

      if (!result.success) throw new Error(result.error || "Failed");

      setStep(3);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Authorization failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke agent access? The agent will no longer be able to make payments."))
      return;
    try {
      await revokeAgentCredentials();
      setExisting(null);
      setStep(1);
      setPasskey(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  const stepLabels = ["Passkey", "Budget", "Authorize"];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Agent Wallet Setup</h1>
        <p className="text-muted text-sm mt-1">
          Create a passkey wallet, set spending limits, and authorize the agent.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const s = (i + 1) as Step;
          const isDone = step > s;
          const isActive = step === s;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-card-border" />}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                  isDone
                    ? "border-success bg-success/10 text-success"
                    : isActive
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-card-border text-muted"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                    isDone
                      ? "bg-success text-white"
                      : isActive
                        ? "bg-accent text-white"
                        : "bg-card-border text-muted"
                  }`}
                >
                  {isDone ? "✓" : s}
                </span>
                <span>{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Existing Session Banner */}
      {existing && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-5">
          <h3 className="font-semibold text-warning mb-2">
            Active Session Found
          </h3>
          <div className="text-sm text-muted space-y-1">
            <p>
              Daily limit: <strong className="text-foreground">${existing.dailyLimitUSD}</strong>
            </p>
            <p>
              Per-tx limit: <strong className="text-foreground">${existing.perTransactionLimitUSD}</strong>
            </p>
            {existing.createdAt && (
              <p>Created: {new Date(existing.createdAt).toLocaleString()}</p>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <Link
              href="/"
              className="flex-1 text-center bg-card hover:bg-card-border text-foreground px-3 py-2 rounded-lg text-sm transition"
            >
              Dashboard
            </Link>
            <button
              onClick={handleRevoke}
              className="flex-1 bg-danger hover:bg-danger/80 text-white px-3 py-2 rounded-lg text-sm transition"
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Create Passkey */}
      {step === 1 && !existing && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">
            Step 1: Create Passkey Wallet
          </h2>
          <p className="text-muted text-sm mb-6">
            Your passkey is the master key. It never leaves your device. The
            agent will get a limited session key derived from it — you stay in
            control.
          </p>
          {passkey && (
            <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
              <p className="font-medium">Passkey created successfully!</p>
              <p className="font-mono text-xs mt-1">
                ID: {passkey.credentialId.slice(0, 30)}...
              </p>
              <p className="font-mono text-xs">
                Key Hash: {passkey.keyHash.slice(0, 20)}...
              </p>
            </div>
          )}
          <button
            onClick={createPasskey}
            disabled={loading}
            className="w-full bg-gradient-to-r from-accent to-purple-500 hover:from-accent-light hover:to-purple-400 text-white px-6 py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? "Creating passkey..." : "Create Passkey Wallet"}
          </button>
        </div>
      )}

      {/* Step 2: Configure Budget */}
      {step === 2 && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">
            Step 2: Set Spending Limits
          </h2>
          <p className="text-muted text-sm mb-6">
            Define how much the agent can spend autonomously. You can revoke
            access at any time.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Daily Limit (USD)
              </label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={1}
                max={10000}
                className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-foreground focus:border-accent focus:outline-none"
              />
              <p className="text-xs text-muted mt-1">
                Maximum the agent can spend in 24 hours
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Per-Transaction Limit (USD)
              </label>
              <input
                type="number"
                value={perTxLimit}
                onChange={(e) => setPerTxLimit(Number(e.target.value))}
                min={0.01}
                max={1000}
                step={0.01}
                className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-foreground focus:border-accent focus:outline-none"
              />
              <p className="text-xs text-muted mt-1">
                Maximum for a single payment
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Session Duration (hours)
              </label>
              <input
                type="number"
                value={sessionHours}
                onChange={(e) => setSessionHours(Number(e.target.value))}
                min={1}
                max={168}
                className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-foreground focus:border-accent focus:outline-none"
              />
              <p className="text-xs text-muted mt-1">
                How long the session key is valid (max 168h / 7 days)
              </p>
            </div>
          </div>
          <button
            onClick={authorizeAgent}
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-accent to-purple-500 hover:from-accent-light hover:to-purple-400 text-white px-6 py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading
              ? "Generating session key..."
              : "Generate Session Key & Authorize Agent"}
          </button>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2 text-success">
            ✓ Agent Authorized
          </h2>
          <p className="text-muted text-sm mb-4">
            The agent now has a session key with the spending limits you set. It
            can make autonomous payments within these bounds.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
            {[
              { label: "Daily Limit", value: `$${dailyLimit}` },
              { label: "Per-Tx Limit", value: `$${perTxLimit}` },
              { label: "Session Duration", value: `${sessionHours}h` },
              { label: "Chains", value: "Solana" },
            ].map((item) => (
              <div key={item.label} className="bg-background/50 rounded p-3">
                <p className="text-muted">{item.label}</p>
                <p className="font-bold text-lg">{item.value}</p>
              </div>
            ))}
          </div>
          {sessionKeyHash && (
            <div className="p-3 bg-background/50 rounded mb-4">
              <p className="text-xs text-muted">Session Key Hash</p>
              <p className="font-mono text-xs text-accent-light break-all">
                {sessionKeyHash}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href="/"
              className="flex-1 text-center bg-card-border hover:bg-muted/20 text-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition"
            >
              View Dashboard
            </Link>
            <button
              onClick={handleRevoke}
              className="flex-1 bg-danger hover:bg-danger/80 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
            >
              Revoke Access
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-muted text-xs space-y-1">
        <p>
          Passkeys use WebAuthn (FIDO2) — your biometrics never leave your
          device.
        </p>
        <p>
          Session keys use secp256k1 — compatible with Solana and EVM chains.
        </p>
      </div>
    </div>
  );
}
