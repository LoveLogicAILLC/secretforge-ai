"use client";

import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Shield, Sparkles, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  const [apis, setApis] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<
    { provider: string; type: "oauth" | "manual"; steps: string[] }[]
  >([]);
  const [manualKeys, setManualKeys] = useState<Record<string, string>>({});

  const handleProvision = async () => {
    const requested = apis
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      setStatus("Please enter one or more API names (e.g., openai, github, stripe)");
      return;
    }
    setLoading(true);
    setStatus("Planning steps…");
    setPlans([]);
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: requested }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to plan");
      setPlans(data.plans || []);
      setStatus("Follow the steps below to provision each provider.");
    } catch (e: any) {
      setStatus(e?.message || "Failed to plan steps.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveManualKey = async (provider: string) => {
    const key = manualKeys[provider]?.trim();
    if (!key) {
      setStatus(`Enter a key for ${provider}.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save key");
      setStatus(`${provider}: key stored (id=${data.id}).`);
      setManualKeys((prev) => ({ ...prev, [provider]: "" }));
    } catch (e: any) {
      setStatus(e?.message || `Failed to store key for ${provider}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-purple-400" />
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              SecretForge AI
            </span>
          </div>
        </div>
      </nav>

      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-purple-900/50 text-purple-300 border-purple-700">
            <Sparkles className="w-3 h-3 mr-1" /> Provision API Keys Automatically
          </Badge>
          <h1 className="text-4xl md:text-5xl font-black mb-3">
            What API keys do you need?
          </h1>
          <p className="text-slate-300">Enter the APIs you need and we’ll provision credentials for you.</p>
        </div>

        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Request Keys</CardTitle>
            <CardDescription>Comma or newline separated (e.g., openai, github, stripe)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <textarea
                value={apis}
                onChange={(e) => setApis(e.target.value)}
                placeholder="openai\ngithub\nstripe"
                className="w-full h-32 rounded-md border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent p-3"
              />
              <div className="flex justify-end">
                <Button onClick={handleProvision} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                  {loading ? "Planning…" : "Fetch Steps"}
                </Button>
              </div>

              {status && (
                <p className="text-sm text-slate-400">{status}</p>
              )}

              {plans.length > 0 && (
                <div className="mt-4 space-y-4">
                  {plans.map((p) => (
                    <div key={p.provider} className="border border-slate-800 rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-purple-400" />
                          <span className="font-medium">{p.provider}</span>
                          <span className="text-xs text-slate-400">({p.type})</span>
                        </div>
                        {p.type === "oauth" ? (
                          <a
                            href={`/api/oauth/start?provider=${encodeURIComponent(p.provider)}`}
                            className="text-sm text-purple-300 hover:text-purple-200"
                          >
                            Authorize
                          </a>
                        ) : null}
                      </div>
                      <ul className="mt-2 text-sm text-slate-400 list-disc pl-5">
                        {p.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                      {p.type === "manual" && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                          <input
                            type="password"
                            placeholder={`Paste ${p.provider} API key`}
                            value={manualKeys[p.provider] || ""}
                            onChange={(e) =>
                              setManualKeys((prev) => ({ ...prev, [p.provider]: e.target.value }))
                            }
                            className="md:col-span-2 w-full rounded-md border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent p-2"
                          />
                          <Button
                            onClick={() => handleSaveManualKey(p.provider)}
                            disabled={loading}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            Save Key
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}