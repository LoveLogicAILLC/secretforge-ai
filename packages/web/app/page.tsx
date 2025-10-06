"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Shield, Zap, Github, Terminal, Sparkles, ArrowRight, AlertTriangle, TrendingUp, Lock, Code, GitPullRequest } from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* Hero Section */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-purple-400" />
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              SecretForge AI
            </span>
          </div>
          <div className="flex gap-4">
            <Button variant="ghost" className="text-slate-300">Docs</Button>
            <Button variant="ghost" className="text-slate-300">Pricing</Button>
            <Button className="bg-purple-600 hover:bg-purple-700">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Above the fold */}
      <section className="container mx-auto px-6 py-24 text-center">
        <Badge className="mb-6 bg-purple-900/50 text-purple-300 border-purple-700">
          <Sparkles className="w-3 h-3 mr-1" />
          AI-Powered Secret Management
        </Badge>
        
        <h1 className="text-6xl md:text-7xl font-black mb-6 leading-tight">
          <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Stop Committing
          </span>
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-600 bg-clip-text text-transparent">
            API Keys Forever
          </span>
        </h1>

        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          AI that detects, provisions, and rotates your API keys automatically.
          <br />
          <span className="text-purple-400 font-semibold">One command. Zero exposed secrets.</span>
        </p>

        <div className="flex gap-4 justify-center mb-12">
          <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-lg px-8 py-6">
            <Terminal className="mr-2" />
            npx @secretforge/cli init
          </Button>
          <Button size="lg" variant="outline" className="border-slate-700 text-lg px-8 py-6">
            <Github className="mr-2" />
            View on GitHub
          </Button>
        </div>

        {/* Social Proof */}
        <div className="flex justify-center items-center gap-8 text-slate-400 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>10,000+ secrets secured</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>Zero exposed keys</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>SOC2 compliant</span>
          </div>
        </div>

        {/* Demo Terminal */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="relative rounded-xl overflow-hidden border border-purple-800/50 shadow-2xl shadow-purple-900/50">
            <div className="bg-slate-900 p-4 border-b border-slate-800 flex items-center gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-slate-400 text-sm ml-4">terminal</span>
            </div>
            <div className="bg-slate-950 p-8 font-mono text-left">
              <div className="text-green-400">$ npx @secretforge/cli init</div>
              <div className="text-purple-400 mt-2">🔍 Analyzing project...</div>
              <div className="text-slate-300 mt-1">📦 Detected: stripe, openai, anthropic</div>
              <div className="text-purple-400 mt-2">🔑 Provisioning keys...</div>
              <div className="text-green-400 mt-1">✅ All secrets secured in 8 seconds</div>
              <div className="text-slate-400 mt-4 text-sm">No more .env files. No more exposed keys. Just magic.</div>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-y border-slate-800 bg-slate-950/50 backdrop-blur-xl py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-white">
              You're One Commit Away From Disaster
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              Every day, developers accidentally expose API keys on GitHub.
              The average cost? <span className="text-red-400 font-bold">$6,500</span> in fraudulent API usage.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="bg-slate-900/50 border-red-900/50">
              <CardHeader>
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <CardTitle className="text-white">Instant Exploitation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400">
                  Bots scan GitHub 24/7. Your exposed key is compromised in <span className="text-red-400 font-bold">&lt;10 minutes</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-orange-900/50">
              <CardHeader>
                <TrendingUp className="w-12 h-12 text-orange-500 mb-4" />
                <CardTitle className="text-white">Massive Bills</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400">
                  Exposed Stripe keys = unauthorized charges. OpenAI keys = crypto mining. AWS keys = <span className="text-orange-400 font-bold">$50k+ bills</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-yellow-900/50">
              <CardHeader>
                <Lock className="w-12 h-12 text-yellow-500 mb-4" />
                <CardTitle className="text-white">Compliance Nightmare</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400">
                  Failed audits. Lost customers. SOC2/GDPR violations = <span className="text-yellow-400 font-bold">massive fines</span>.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            The AI That Protects Your Secrets
          </h2>
          <p className="text-xl text-slate-400">
            Built with Cloudflare's edge AI and Model Context Protocol
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="bg-gradient-to-br from-purple-900/20 to-slate-900/50 border-purple-800/50">
            <CardHeader>
              <Zap className="w-10 h-10 text-purple-400 mb-2" />
              <CardTitle className="text-white">Auto-Detection</CardTitle>
              <CardDescription className="text-slate-400">
                Scans your package.json and detects required API services instantly
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-pink-900/20 to-slate-900/50 border-pink-800/50">
            <CardHeader>
              <Shield className="w-10 h-10 text-pink-400 mb-2" />
              <CardTitle className="text-white">Zero-Config Provisioning</CardTitle>
              <CardDescription className="text-slate-400">
                AI provisions keys with optimal scopes and permissions automatically
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/20 to-slate-900/50 border-blue-800/50">
            <CardHeader>
              <GitPullRequest className="w-10 h-10 text-blue-400 mb-2" />
              <CardTitle className="text-white">GitHub Shield</CardTitle>
              <CardDescription className="text-slate-400">
                Catch exposed secrets in PRs before they hit production
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-green-900/20 to-slate-900/50 border-green-800/50">
            <CardHeader>
              <Code className="w-10 h-10 text-green-400 mb-2" />
              <CardTitle className="text-white">MCP Integration</CardTitle>
              <CardDescription className="text-slate-400">
                Works natively with Claude Code and AI coding assistants
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-900/20 to-slate-900/50 border-yellow-800/50">
            <CardHeader>
              <CheckCircle2 className="w-10 h-10 text-yellow-400 mb-2" />
              <CardTitle className="text-white">Compliance Validation</CardTitle>
              <CardDescription className="text-slate-400">
                SOC2, GDPR, HIPAA, PCI-DSS compliance checking built-in
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gradient-to-br from-purple-900/20 to-slate-900/50 border-purple-800/50">
            <CardHeader>
              <Sparkles className="w-10 h-10 text-purple-400 mb-2" />
              <CardTitle className="text-white">Smart Rotation</CardTitle>
              <CardDescription className="text-slate-400">
                AI-powered rotation schedules based on usage patterns
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="border-y border-slate-800 bg-gradient-to-r from-purple-950 to-pink-950 py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold mb-6 text-white">
            Ready to Never Expose Another Secret?
          </h2>
          <p className="text-xl text-purple-200 mb-12 max-w-2xl mx-auto">
            Join thousands of developers securing their APIs with AI
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center items-center max-w-xl mx-auto">
            <Input 
              placeholder="your@email.com" 
              className="bg-slate-900/50 border-purple-700 text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button size="lg" className="bg-white text-purple-900 hover:bg-slate-100 font-bold">
              Get Early Access
              <ArrowRight className="ml-2" />
            </Button>
          </div>

          <p className="text-slate-400 mt-6 text-sm">
            Free forever for open source projects • No credit card required
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 py-12 border-t border-slate-800">
        <div className="container mx-auto px-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-purple-400" />
              <span className="font-bold text-white">SecretForge AI</span>
            </div>
            <div className="flex gap-6 text-slate-400">
              <a href="#" className="hover:text-purple-400">GitHub</a>
              <a href="#" className="hover:text-purple-400">Twitter</a>
              <a href="#" className="hover:text-purple-400">Docs</a>
              <a href="#" className="hover:text-purple-400">Discord</a>
            </div>
          </div>
          <div className="mt-8 text-center text-slate-500 text-sm">
            © 2025 SecretForge AI. Built with Cloudflare Workers & AI Agents.
          </div>
        </div>
      </footer>
    </div>
  );
}
