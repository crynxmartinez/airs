"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Target,
  TrendingUp,
  BookOpen,
  Settings,
  User,
  Hexagon,
  ArrowLeft,
  Plus,
  Folder,
  Gauge,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

export function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }, [pathname]);

  // Extract active project ID from path
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const activeProjectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : null;
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const otherProjects = projects.filter((p) => p.id !== activeProjectId);

  const isGeneralView = !activeProjectId;

  // Project-scoped nav items
  const projectNavItems = [
    { label: "Dashboard", href: `/projects/${activeProjectId}`, icon: LayoutDashboard },
    { label: "Evaluations", href: `/projects/${activeProjectId}/evaluations`, icon: ClipboardList },
    { label: "Missions", href: `/projects/${activeProjectId}/missions`, icon: Target },
    { label: "Benchmarks", href: `/projects/${activeProjectId}/benchmarks`, icon: TrendingUp },
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isExactActive(href: string) {
    return pathname === href;
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Hexagon className="h-7 w-7 text-blue-500" fill="currentColor" />
        <span className="text-lg font-bold text-white">AIRS CRM</span>
      </div>

      <div className="mx-3 border-t border-white/10" />

      {/* No project selected — general view */}
      {isGeneralView && (
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive("/dashboard") && !isActive("/dashboard/")
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            Dashboard
          </Link>

          {/* Projects section */}
          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Projects
            </p>
            <div className="space-y-1">
              {projects.length > 0 ? (
                projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))
              ) : (
                <p className="px-3 py-1.5 text-xs text-slate-500">No projects yet</p>
              )}
              <Link
                href="/projects/new"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-blue-400 hover:bg-white/5 hover:text-blue-300 transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" />
                New Project
              </Link>
            </div>
          </div>
        </nav>
      )}

      {/* Project selected — project-scoped view */}
      {!isGeneralView && (
        <nav className="flex-1 space-y-1 px-3 py-4">
          {/* Back to all projects */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            All Projects
          </Link>

          {/* Active project name */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-blue-400" />
              <span className="truncate text-sm font-semibold text-white">
                {activeProject?.name || "Loading..."}
              </span>
            </div>
          </div>

          <div className="my-2 border-t border-white/10" />

          {/* Project nav items */}
          {projectNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.label === "Dashboard" ? isExactActive(item.href) : isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {/* Other projects */}
          {otherProjects.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Other Projects
              </p>
              <div className="space-y-1">
                {otherProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      )}

      {/* Divider */}
      <div className="mx-3 border-t border-white/10" />

      {/* Global items (always visible) */}
      <div className="space-y-1 px-3 py-3">
        <Link
          href="/audit"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive("/audit")
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          )}
        >
          <Gauge className="h-5 w-5 shrink-0" />
          Website Audit
        </Link>
        <Link
          href="/knowledge"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive("/knowledge")
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          )}
        >
          <BookOpen className="h-5 w-5 shrink-0" />
          Knowledge Base
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive("/settings")
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          Settings
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-white/10" />

      {/* User Profile */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
          <User className="h-4 w-4 text-slate-300" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">User</span>
          <span className="text-xs text-slate-400">Evaluator</span>
        </div>
      </div>
    </aside>
  );
}
