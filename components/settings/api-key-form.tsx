"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

import {
  clearGeminiKeyAction,
  saveGeminiKeyAction,
  testGeminiKeyAction,
} from "@/app/actions/settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeminiKeyStatus } from "@/lib/settings";

type Message = { kind: "success" | "error"; text: string } | null;

export function ApiKeyForm({ initialStatus }: { initialStatus: GeminiKeyStatus }) {
  const [status, setStatus] = useState<GeminiKeyStatus>(initialStatus);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveGeminiKeyAction(key);
      if (res.ok) {
        setStatus(res.data);
        setKey("");
        setMessage({ kind: "success", text: "Key saved. Scoring, synthesis, and enrichment are now enabled." });
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  }

  function handleClear() {
    setMessage(null);
    startTransition(async () => {
      const res = await clearGeminiKeyAction();
      if (res.ok) {
        setStatus(res.data);
        setMessage({ kind: "success", text: "Stored key removed." });
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  }

  function handleTest() {
    setMessage(null);
    startTransition(async () => {
      const res = await testGeminiKeyAction();
      setMessage(
        res.ok
          ? { kind: "success", text: `Works — ${res.data.model} responded.` }
          : { kind: "error", text: res.error },
      );
    });
  }

  const sourceLabel =
    status.source === "manual"
      ? "Saved in app"
      : status.source === "env"
        ? "From .env.local"
        : "Not set";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Status:</span>
        {status.configured ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3.5" />
            Key set {status.masked}
          </Badge>
        ) : (
          <Badge variant="outline">No key set</Badge>
        )}
        <Badge variant="secondary">{sourceLabel}</Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gemini-key">Gemini API key</Label>
        <Input
          id="gemini-key"
          type="password"
          autoComplete="off"
          placeholder="AIza…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Get one free at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            aistudio.google.com/apikey
          </a>
          . Stored only on this machine (your local DB), used server-side, and never shown again.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={pending || key.trim().length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Save key
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={pending || !status.configured}>
          Test key
        </Button>
        {status.source === "manual" ? (
          <Button variant="ghost" onClick={handleClear} disabled={pending}>
            Remove saved key
          </Button>
        ) : null}
      </div>

      {message ? (
        <Alert variant={message.kind === "success" ? "success" : "destructive"}>
          <AlertTitle>{message.kind === "success" ? "Done" : "Problem"}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
