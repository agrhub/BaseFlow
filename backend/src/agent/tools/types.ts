import { ParsedClass } from '../../utils/parser';

// Shared state for the scanned project
export let currentScanResult: {
  repoPath: string;
  classes: ParsedClass[];
} | null = null;

export function setCurrentScanResult(repoPath: string, classes: ParsedClass[]) {
  currentScanResult = { repoPath, classes };
}

// Collector for frontend actions triggered by tools
export let pendingActions: { type: string; payload: any }[] = [];

export function clearPendingActions() {
  const actions = [...pendingActions];
  pendingActions = [];
  return actions;
}