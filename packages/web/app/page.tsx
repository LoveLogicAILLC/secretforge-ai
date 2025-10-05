"use client";

import { useState } from "react";
import { useAgent } from "agents/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [secrets, setSecrets] = useState([]);
  const [message, setMessage] = useState("");

  const agent = useAgent({
    agent: "SECRET_AGENT",
    name: "user-123",
    onMessage: (msg) => {
      console.log("Agent message:", msg.data);
    },
  });

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">SecretForge AI Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Total Secrets</CardTitle>
            <CardDescription>Across all environments</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{secrets.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Rotations</CardTitle>
            <CardDescription>Keys requiring rotation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">3</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Score</CardTitle>
            <CardDescription>Overall compliance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">98%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>AI Assistant</CardTitle>
          <CardDescription>Ask about your secrets or request new keys</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Ask SecretForge AI anything..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  agent.send(JSON.stringify({ message }));
                  setMessage("");
                }
              }}
            />
            <Button
              onClick={() => {
                agent.send(JSON.stringify({ message }));
                setMessage("");
              }}
            >
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>Manage and rotate your secrets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {secrets.map((secret: any) => (
              <div
                key={secret.id}
                className="flex items-center justify-between p-4 border rounded"
              >
                <div>
                  <p className="font-semibold">{secret.service}</p>
                  <p className="text-sm text-gray-500">{secret.id}</p>
                </div>
                <div className="flex gap-2">
                  <Badge>{secret.environment}</Badge>
                  <Button variant="outline" size="sm">
                    Rotate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
