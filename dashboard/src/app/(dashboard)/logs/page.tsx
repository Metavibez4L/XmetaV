"use client";

import React from "react";
import { Terminal, FileText, Activity } from "lucide-react";
import { LiveLogs } from "@/components/LiveLogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LogsPage() {
  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: "#00f0ff08", border: "1px solid #00f0ff15" }}
        >
          <Terminal className="h-5 w-5" style={{ color: "#00f0ff" }} />
        </div>
        <div className="flex-1">
          <h1
            className="text-xl font-mono font-bold tracking-wider neon-glow"
            style={{ color: "#00f0ff" }}
          >
            SYSTEM LOGS
          </h1>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "#4a6a8a" }}>
            Real-time agent activity // command outputs // error tracking
          </p>
        </div>
      </div>

      <Tabs defaultValue="live" className="flex-1 flex flex-col">
        <TabsList className="w-fit mb-4 bg-[#0a0f1a] border border-[#00f0ff15]">
          <TabsTrigger
            value="live"
            className="text-[10px] font-mono data-[state=active]:bg-[#00f0ff15] data-[state=active]:text-[#00f0ff]"
          >
            <Activity className="h-3 w-3 mr-1" />
            Live Stream
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="text-[10px] font-mono data-[state=active]:bg-[#00f0ff15] data-[state=active]:text-[#00f0ff]"
          >
            <FileText className="h-3 w-3 mr-1" />
            Log Files
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="flex-1 m-0">
          <LiveLogs />
        </TabsContent>

        <TabsContent value="files" className="flex-1 m-0">
          <Card className="h-full bg-[#0a0f1a] border-[#00f0ff15]">
            <CardHeader>
              <CardTitle className="text-xs font-mono uppercase tracking-wider" style={{ color: "#00f0ff88" }}>
                Log File Browser
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[10px] font-mono text-[#4a6a8a]">
                <p>Log file browser coming soon.</p>
                <p className="mt-2">Access logs directly at:</p>
                <ul className="mt-2 space-y-1 ml-4">
                  <li className="text-[#00f0ff]">~/.openclaw/logs/</li>
                  <li className="text-[#00f0ff]">~/.openclaw/workspace/logs/</li>
                  <li className="text-[#00f0ff]">dashboard/bridge/logs/</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
