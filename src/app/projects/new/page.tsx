"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, target_location: targetLocation || undefined }),
      });
      const data = await res.json();
      if (data.id) {
        router.push(`/projects/${data.id}`);
      }
    } catch (err) { console.error("[page.tsx]", err); }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a project to group evaluations for a specific niche or market
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Project Name
          </label>
          <div className="relative">
            <Folder className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Plumber Chicago"
              className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Description <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Competitor analysis for plumbing services in Chicago area"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Target Location
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={targetLocation}
              onChange={(e) => setTargetLocation(e.target.value)}
              placeholder="e.g., Australia, Sydney, Chicago"
              className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            This location will be used to search for local competitors
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Project
          </Button>
        </div>
      </div>
    </div>
  );
}
