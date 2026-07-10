"use client";

import * as React from "react";
import { BrainCircuitIcon, CheckCircle2Icon, Loader2Icon, PlugZapIcon } from "lucide-react";
import { toast } from "sonner";

import {
  clearAiSettingsAction,
  saveAiSettingsAction,
  testAiConnectionAction,
} from "@/app/(app)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderOption = {
  value: string;
  name: string;
  defaultModel: string;
  keyOptional: boolean;
  custom: boolean;
};

const KEY_HELP: Record<string, string> = {
  ANTHROPIC: "console.anthropic.com → API keys",
  GROQ: "console.groq.com (free tier)",
  GEMINI: "aistudio.google.com (free tier — may train on your data)",
  OPENROUTER: "openrouter.ai/keys (has :free models)",
  MISTRAL: "console.mistral.ai (free tier)",
  OLLAMA: "self-hosted, no key needed",
  OPENAI: "platform.openai.com",
  CUSTOM: "any OpenAI-compatible server",
};

export function AiProviderCard({
  options,
  active,
  source,
  configured,
  saved,
}: {
  options: ProviderOption[];
  active: string | null;
  source: "settings" | "env" | null;
  configured: boolean;
  saved: { provider: string; model: string | null; baseUrl: string | null; hasKey: boolean } | null;
}) {
  const [provider, setProvider] = React.useState(saved?.provider ?? "ANTHROPIC");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState(saved?.model ?? "");
  const [baseUrl, setBaseUrl] = React.useState(saved?.baseUrl ?? "");
  const [pending, start] = React.useTransition();
  const [testing, setTesting] = React.useState(false);

  const opt = options.find((o) => o.value === provider);
  const keptKey = saved?.provider === provider && saved.hasKey;

  function save() {
    // Guard against browser autofill dropping an email/garbage into Model.
    if (model && (model.includes("@") || /\s/.test(model))) {
      toast.error("That doesn't look like a model ID — clear the Model field to use the default.");
      return;
    }
    start(async () => {
      const result = await saveAiSettingsAction({
        provider,
        apiKey: apiKey || undefined,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
      });
      if (result.error) toast.error(result.error);
      else {
        setApiKey("");
        toast.success("AI provider saved");
      }
    });
  }

  function clear() {
    start(async () => {
      const result = await clearAiSettingsAction();
      if (result.error) toast.error(result.error);
      else {
        setApiKey("");
        toast.success("Reverted to the .env default");
      }
    });
  }

  async function test() {
    setTesting(true);
    const result = await testAiConnectionAction();
    setTesting(false);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuitIcon className="size-4" /> AI provider (Ask Perx &amp; Canvas)
        </CardTitle>
        <CardDescription>
          The key that <strong>powers</strong> the assistant and generative canvas. Set it here to
          skip editing <code>.env</code>. Org-wide, admin-only; the key is encrypted at rest and
          never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Currently active:</span>
          {configured && active ? (
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2Icon className="size-3" /> {active}
              <span className="opacity-70">· from {source === "settings" ? "Settings" : ".env"}</span>
            </Badge>
          ) : (
            <Badge variant="secondary">Not configured</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger aria-label="Provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{KEY_HELP[provider]}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-model">
              Model <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="ai-model"
              name="ai-model"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={opt?.defaultModel || "provider default"}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-key">
            API key{" "}
            {opt?.keyOptional ? (
              <span className="text-muted-foreground">(not needed for {opt.name})</span>
            ) : keptKey ? (
              <span className="text-muted-foreground">(leave blank to keep current key)</span>
            ) : null}
          </Label>
          <Input
            id="ai-key"
            name="ai-provider-key"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keptKey ? "•••••••• (saved)" : opt?.keyOptional ? "—" : "sk-… / gsk_… / your key"}
          />
        </div>

        {opt?.custom ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-baseurl">Base URL (OpenAI-compatible)</Label>
            <Input
              id="ai-baseurl"
              name="ai-baseurl"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-server/v1"
            />
          </div>
        ) : null}

        {provider === "GEMINI" ? (
          <Alert>
            <AlertDescription className="text-xs">
              Google&apos;s free Gemini tier may use your prompts — which include CRM data — to
              improve their models. Prefer Anthropic or self-hosted Ollama for business data.
            </AlertDescription>
          </Alert>
        ) : null}

        {provider === "OPENROUTER" && (model === "" || model.includes(":free")) ? (
          <Alert>
            <AlertDescription className="text-xs">
              OpenRouter&apos;s <code>:free</code> models return a 404 (&ldquo;no endpoints
              found&rdquo;) until you enable free-model access at{" "}
              <span className="font-medium">openrouter.ai/settings/privacy</span>. If it fails,
              enable that, pick a different model, or use a paid model / another provider.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} Save
          </Button>
          <Button size="sm" variant="outline" onClick={test} disabled={testing || pending}>
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test connection
          </Button>
          {saved ? (
            <Button size="sm" variant="ghost" onClick={clear} disabled={pending}>
              Reset to .env
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
