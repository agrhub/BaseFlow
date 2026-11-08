/**
 * Parsed-repository cache (in memory and on disk) and on-demand scanning.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseRepository, ParsedClass, parseSingleFile, generateGraphLayout } from '../../utils/parser';
import { connectionStore } from '../ConnectionStore';
import { setCurrentScanResult } from '../../agent/tools/types';
import { tempDir, cacheFileName, resolveRepoPath, resolveCachePath } from './workspace';
import { zipCloneOrPull, zipRefresh } from './archive';

interface CachedRepo {
  repoPath: string;
  classes: ParsedClass[];
  graph: any;
}

const repoCache = new Map<string, CachedRepo>();

export function clearRepoCache(profileName: string) {
  console.log(`Clearing in-memory and disk cache for connection ${profileName}...`);
  repoCache.delete(profileName);
  const cachePath = path.join(tempDir, cacheFileName(profileName));
  if (fs.existsSync(cachePath)) {
    try {
      fs.unlinkSync(cachePath);
    } catch (e: any) {
      console.warn(`Failed to delete cache file at ${cachePath}:`, e.message || e);
    }
  }
}

// Scan repository utility
export async function getOrScanRepo(profileName: string): Promise<{ repoPath: string; classes: ParsedClass[]; graph: any }> {
  if (repoCache.has(profileName)) {
    console.log(`Returning in-memory cache for connection ${profileName}...`);
    return repoCache.get(profileName)!;
  }

  const profile = await connectionStore.getConnection(profileName);
  if (!profile) {
    throw new Error(`Profile ${profileName} not found.`);
  }

  const targetPath = resolveRepoPath(profile);

  // If remote and does not exist, download ZIP
  if (profile.options?.type !== 'local' && !fs.existsSync(targetPath)) {
    console.log(`Auto-downloading remote ZIP for ${profile.uri} to ${targetPath}...`);
    const cachePath = resolveCachePath(profileName);
    try {
      await zipCloneOrPull(profile.uri, targetPath, profile.options, cachePath);
    } catch (e: any) {
      console.error(`Failed to download and extract ZIP:`, e);
      throw e;
    }
  }

  // Check for cached scan result file
  const cachePath = resolveCachePath(profileName);
  const useCache = fs.existsSync(cachePath);

  if (!useCache && !fs.existsSync(targetPath)) {
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  if (useCache) {
    try {
      console.log(`Loading cached parse result for connection ${profileName}...`);
      const cacheContent = fs.readFileSync(cachePath, 'utf-8');
      const result = JSON.parse(cacheContent);
      setCurrentScanResult(targetPath, result.classes);
      const resVal = {
        repoPath: targetPath,
        classes: result.classes,
        graph: result
      };
      repoCache.set(profileName, resVal);
      return resVal;
    } catch (err) {
      console.warn(`Failed to parse cache file for ${profileName}, re-scanning...`, err);
    }
  }

  let result;
  if (profile.options?.type !== 'local' && process.env.CLOUD_RUN === '1') {
    console.log(`Re-indexing remote repository ${profileName} using GCS ZIP cache on Cloud Run...`);
    result = await zipRefresh(targetPath, cachePath);
  } else {
    console.log(`First scan or changes detected/Local re-indexing. Parsing repository ${profileName}...`);
    result = parseRepository(targetPath);
    
    // Write to cache file
    try {
      fs.writeFileSync(cachePath, JSON.stringify(result), 'utf-8');
    } catch (err) {
      console.warn(`Failed to write cache file for ${profileName}:`, err);
    }
  }

  setCurrentScanResult(targetPath, result.classes);
  const finalRes = {
    repoPath: targetPath,
    classes: result.classes,
    graph: result
  };
  repoCache.set(profileName, finalRes);
  return finalRes;
}

// Parse single file and update connection cache and layout graph in-memory and on-disk
export async function updateCacheWithParsedFile(
  profileName: string,
  relativeFilePath: string,
  content: string
): Promise<ParsedClass[]> {
  const cacheData = await getOrScanRepo(profileName);
  const repoPath = cacheData.repoPath;
  const fullPath = path.resolve(repoPath, relativeFilePath);

  // Parse the file to get the new classes list
  const newClasses = parseSingleFile(fullPath, relativeFilePath, content);

  // Filter out any existing classes for this file path
  const filteredClasses = cacheData.classes.filter(c => c.filePath !== relativeFilePath);

  // Append new classes
  const allClasses = [...filteredClasses, ...newClasses];

  // Regenerate the graph layout
  const { nodes, edges } = generateGraphLayout(allClasses);

  // Update in-memory cache
  const updatedCache = {
    repoPath,
    classes: allClasses,
    graph: {
      classes: allClasses,
      nodes,
      edges
    }
  };
  repoCache.set(profileName, updatedCache);

  // Update on-disk cache file
  const cachePath = resolveCachePath(profileName);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(updatedCache.graph), 'utf-8');
    setCurrentScanResult(repoPath, allClasses);
    console.log(`[Cache Update] Successfully updated cache and graph for file: ${relativeFilePath}`);
  } catch (err) {
    console.warn(`[Cache Update] Failed to write updated cache file for ${profileName}:`, err);
  }

  return newClasses;
}
