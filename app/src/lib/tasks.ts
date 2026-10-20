// Tracks user-started jobs OUTSIDE React, so a job keeps running (and keeps its
// result) when the user switches pages. Pages read a task with useTask(); the
// toaster listens with onTaskFinished(); the sidebar shows runningSections().
// No window access here, so it stays unit-testable.
import { useSyncExternalStore } from "react";
import type { NavTarget } from "@/lib/nav";

export type TaskStatus = "running" | "done" | "error";
export type TaskGroup = "cleanup" | "perf" | "restore" | "change";

export interface Task<R = unknown> {
  key: string;
  label: string;
  where: NavTarget;
  group?: TaskGroup;
  silent: boolean;
  status: TaskStatus;
  startedAt: number;
  finishedAt?: number;
  result?: R;
  error?: string;
  summary?: string;
}

export interface RunOptions<R> {
  label: string;
  where: NavTarget;
  group?: TaskGroup;
  silent?: boolean;
  summarize?: (r: R) => string;
  /** Return a message to mark a resolved result as failed (e.g. `{ ok:false, message }`). */
  isError?: (r: R) => string | null;
}

// A group can't start while any of these groups is running.
const CONFLICTS: Record<TaskGroup, TaskGroup[]> = {
  cleanup: ["cleanup"], perf: ["perf"], restore: ["change"], change: ["restore"],
};

let tasks = new Map<string, Task>();
let sections = new Set<string>();
const listeners = new Set<() => void>();
const finishListeners = new Set<(t: Task) => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function commit(nextTasks: Map<string, Task>) {
  tasks = nextTasks;
  // a new Set only when the running sections actually changed
  const next = new Set<string>();
  tasks.forEach((x) => x.status === "running" && next.add(x.where.section));
  if (next.size !== sections.size || [...next].some((s) => !sections.has(s))) sections = next;
  listeners.forEach((l) => l());
}
const setTask = (t: Task) => commit(new Map(tasks).set(t.key, t));

export const getTask = <R = unknown>(key: string) => tasks.get(key) as Task<R> | undefined;
export function useTask<R = unknown>(key: string): Task<R> | undefined {
  return useSyncExternalStore(subscribe, () => getTask<R>(key), () => getTask<R>(key));
}

export function blockedBy(group?: TaskGroup): Task | undefined {
  if (!group) return undefined;
  const against = CONFLICTS[group];
  for (const t of tasks.values())
    if (t.status === "running" && t.group && against.includes(t.group)) return t;
  return undefined;
}
export function useBlockedBy(group?: TaskGroup): Task | undefined {
  return useSyncExternalStore(subscribe, () => blockedBy(group), () => blockedBy(group));
}

export const runningSections = () => sections;
export function useRunningSections(): Set<string> {
  return useSyncExternalStore(subscribe, runningSections, runningSections);
}

export function onTaskFinished(cb: (t: Task) => void) {
  finishListeners.add(cb);
  return () => void finishListeners.delete(cb);
}

export function clearTask(key: string) {
  if (!tasks.has(key)) return;
  const next = new Map(tasks);
  next.delete(key);
  commit(next);
}

/** Runs `fn` as a tracked task. Resolves undefined (without calling `fn`) when
 *  the same key is already running or a conflicting group is; never throws. */
export async function runTask<R>(
  key: string,
  opts: RunOptions<R>,
  fn: () => Promise<R>,
): Promise<R | undefined> {
  if (tasks.get(key)?.status === "running" || blockedBy(opts.group)) return undefined;
  const base: Task<R> = {
    key, label: opts.label, where: opts.where, group: opts.group,
    silent: opts.silent ?? false, status: "running", startedAt: Date.now(),
  };
  setTask(base);

  let final: Task<R>;
  let value: R | undefined;
  try {
    const r = await fn();
    value = r;
    const err = opts.isError?.(r) ?? null;
    final = err !== null
      ? { ...base, status: "error", finishedAt: Date.now(), result: r, error: err }
      : { ...base, status: "done", finishedAt: Date.now(), result: r, summary: opts.summarize?.(r) };
  } catch (e) {
    value = undefined;
    final = { ...base, status: "error", finishedAt: Date.now(), error: e instanceof Error ? e.message : String(e) };
  }
  setTask(final);
  finishListeners.forEach((cb) => cb(final));
  return value;
}
