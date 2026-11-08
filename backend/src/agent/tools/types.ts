import { ParsedClass } from '../../utils/parser';

/**
 * Per-session agent state.
 *
 * Previously the scanned repository, pending UI actions and modified files were
 * module-level globals shared by every user/tab, so two chats on different
 * repositories could read and write each other's workspace. State is now keyed
 * by the ADK session id (available to every tool through its ToolContext) and,
 * for modified files, by repository path.
 */

export interface ScanResult {
  repoPath: string;
  classes: ParsedClass[];
}

export interface AgentAction {
  type: string;
  payload: any;
}

interface AgentSessionState {
  connectionName: string;
  scan: ScanResult | null;
  pendingActions: AgentAction[];
  lastUsed: number;
}

const MAX_SESSIONS = 200;
const sessions = new Map<string, AgentSessionState>();

// Files modified by agent tools, tracked per repository workspace
const modifiedFilesByRepo = new Map<string, Set<string>>();

function touch(sessionId: string): AgentSessionState {
  let state = sessions.get(sessionId);
  if (!state) {
    state = { connectionName: '', scan: null, pendingActions: [], lastUsed: Date.now() };
    sessions.set(sessionId, state);
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest) sessions.delete(oldest[0]);
    }
  }
  state.lastUsed = Date.now();
  return state;
}

/** Bind a chat session to the connection (and scanned repository) it is working on. */
export function bindAgentSession(sessionId: string, connectionName: string, scan: ScanResult | null) {
  const state = touch(sessionId);
  state.connectionName = connectionName;
  state.scan = scan;
}

export function forgetAgentSession(sessionId: string) {
  sessions.delete(sessionId);
}

/** Extract the ADK session id from a tool context. */
export function sessionIdOf(toolContext: any): string {
  return toolContext?.sessionId || toolContext?.invocationContext?.session?.id || '';
}

/** Scan result of the repository bound to the calling chat session. */
export function getSessionScan(toolContext: any): ScanResult | null {
  const id = sessionIdOf(toolContext);
  return (id && sessions.get(id)?.scan) || null;
}

/** Connection name bound to the calling chat session. */
export function getSessionConnection(toolContext: any): string {
  const id = sessionIdOf(toolContext);
  return (id && sessions.get(id)?.connectionName) || '';
}

/** Queue a UI action for the calling chat session. */
export function pushAction(toolContext: any, action: AgentAction) {
  const id = sessionIdOf(toolContext);
  if (!id) return;
  touch(id).pendingActions.push(action);
}

/** Return and clear the UI actions queued for a session. */
export function drainActions(sessionId: string): AgentAction[] {
  const state = sessions.get(sessionId);
  if (!state) return [];
  const actions = state.pendingActions;
  state.pendingActions = [];
  return actions;
}

/**
 * Called whenever a repository is (re)parsed so that sessions bound to it see
 * the fresh class list.
 */
export function setCurrentScanResult(repoPath: string, classes: ParsedClass[]) {
  for (const state of sessions.values()) {
    if (state.scan && state.scan.repoPath === repoPath) {
      state.scan = { repoPath, classes };
    }
  }
}

export function getModifiedFiles(repoPath: string): Set<string> {
  let set = modifiedFilesByRepo.get(repoPath);
  if (!set) {
    set = new Set<string>();
    modifiedFilesByRepo.set(repoPath, set);
  }
  return set;
}

export function clearModifiedFiles(repoPath: string) {
  modifiedFilesByRepo.delete(repoPath);
}
