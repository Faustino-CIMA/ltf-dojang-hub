"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FieldLock } from "@/components/members/field-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isMaskedSecretNumber, maskSecretNumber } from "@/lib/mask-secret";
import { revealSocialSecurityNumber } from "@/lib/member-verification";

const REVEAL_MS = 30_000;

export function SecretNumberField({
  id,
  label,
  value,
  onChange,
  locked,
  canReveal,
  lockedLabel,
  openLabel,
  showLabel,
  hideLabel,
  memberId,
  maxLength,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  locked: boolean;
  canReveal: boolean;
  lockedLabel: string;
  openLabel: string;
  showLabel: string;
  hideLabel: string;
  memberId?: number;
  maxLength?: number;
  required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [stored, setStored] = useState(() => value.trim().length > 0);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setRevealed(false);
    setStored(valueRef.current.trim().length > 0);
  }, [memberId]);

  useEffect(() => {
    if (isMaskedSecretNumber(value)) {
      setStored(true);
    }
  }, [value]);

  useEffect(() => {
    if (!revealed) {
      return;
    }
    const timer = window.setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function toggle() {
    if (!canReveal) {
      return;
    }
    if (revealed) {
      setRevealed(false);
      return;
    }
    const alreadyLoaded = /[0-9A-Za-z]/.test(value);
    if (memberId) {
      try {
        const body = await revealSocialSecurityNumber(memberId);
        const next = body?.social_security_number ?? "";
        if (next !== value) {
          onChange(next);
        }
      } catch {
        if (!alreadyLoaded) {
          return;
        }
      }
    }
    setRevealed(true);
  }

  const shown = stored && !revealed ? maskSecretNumber(value) : value;
  const editable = (!stored && !locked) || (revealed && !locked);

  return (
    <div className="space-y-2">
      <div className="flex min-h-[var(--control-height)] flex-wrap items-center justify-between gap-2 sm:h-[var(--control-height)] sm:flex-nowrap">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} required={required} className="w-auto">
            {label}
          </Label>
          <FieldLock locked={locked} lockedLabel={lockedLabel} openLabel={openLabel} />
        </div>
        {canReveal && stored ? (
          <Button type="button" variant="outline" size="sm" aria-pressed={revealed} onClick={() => void toggle()}>
            {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {revealed ? hideLabel : showLabel}
          </Button>
        ) : null}
      </div>
      <Input
        id={id}
        className="w-full"
        autoComplete="off"
        required={required}
        readOnly={!editable}
        maxLength={maxLength}
        value={shown}
        onChange={(event) => {
          if (!editable) {
            return;
          }
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
