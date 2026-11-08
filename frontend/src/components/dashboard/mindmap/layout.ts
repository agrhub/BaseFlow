/**
 * Mindmap layout: builds the class tree / directory tree and computes node positions.
 * The functions read the component's expansion and selection state through the
 * refs passed to createMindmapLayout, exactly as they did inside Mindmap.vue.
 */
import type { Ref } from 'vue';

export const ROOT_W        = 160;
export const NODE_W        = 200;
export const NODE_H        = 42;
export const COL_GAP       = 60;
export const ROW_GAP       = 8;
export const MAX_DEFAULT_NODES = 10;

export const COLORS = [
  '#7C3AED','#2563EB','#0891B2','#059669',
  '#D97706','#DC2626','#DB2777','#0D9488',
  '#6366F1','#EA580C','#16A34A','#9333EA',
];

// Track dark mode by observing html.dark class

export interface TreeNode {
  id: string;
  name: string;
  type: 'root' | 'directory' | 'class' | 'property' | 'method' | 'more';
  filePath?: string;
  branchColor?: string;
  classData?: any;
  children: TreeNode[];
  width: number;
  height: number;
  subtreeHeight: number;
  x?: number;
  y?: number;
  nameOnly?: string;
  isHighlighted?: boolean;
  depth?: number;
}

export interface MindmapLayoutState {
  expandedNodes: Ref<Set<string>>;
  activeNodeId: Ref<string | null>;
  activeLeafName: Ref<string | null>;
  props: { initialEdges: any[] };
}

export function createMindmapLayout(state: MindmapLayoutState) {
  const { expandedNodes, activeNodeId, activeLeafName, props } = state;

  // ──────────────────────────────────────────────
  // Multi-directional Class Tree Builder (Logic from old Vue Flow)
  // ──────────────────────────────────────────────

  function buildClassTree(
    rawNodes: any[],
    activeNodeIdVal: string | null,
    activeLeafNameVal: string | null,
    initialEdgesVal: any[]
  ): TreeNode {
    const rootNode: TreeNode = {
      id: 'mm-root',
      name: '⬡ Project',
      type: 'root',
      children: [],
      width: ROOT_W,
      height: NODE_H,
      subtreeHeight: NODE_H
    };

    const relatedClassIds = new Set<string>();
    if (activeNodeIdVal) {
      const activeLower = activeNodeIdVal.toLowerCase();
      initialEdgesVal.forEach(e => {
        if (e.source.toLowerCase() === activeLower) {
          relatedClassIds.add(e.target);
        } else if (e.target.toLowerCase() === activeLower) {
          relatedClassIds.add(e.source);
        }
      });
    }

    const dirNodesMap = new Map<string, TreeNode>();

    rawNodes.forEach(n => {
      const fp = (n.data?.filePath || '').replace(/\\/g, '/');
      const parts = fp.split('/');
      let currentParent = rootNode;
      let pathAccumulator = '';
      const dirParts = parts.slice(0, -1);

      dirParts.forEach((part: string, idx: number) => {
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
        let dirNode = dirNodesMap.get(pathAccumulator);
        if (!dirNode) {
          dirNode = {
            id: `dir-${pathAccumulator}`,
            name: part,
            type: 'directory',
            filePath: pathAccumulator,
            children: [],
            width: 180,
            height: 38,
            subtreeHeight: 38,
            depth: idx + 1
          };
          dirNodesMap.set(pathAccumulator, dirNode);
          currentParent.children.push(dirNode);
        }
        currentParent = dirNode;
      });

      const classNodeId = n.id;
      const isNodeActive = activeNodeIdVal === classNodeId;
      const isNodeRelated = relatedClassIds.has(classNodeId);

      const classNode: TreeNode = {
        id: classNodeId,
        name: n.data.name,
        type: 'class',
        filePath: fp,
        classData: n.data,
        children: [],
        width: 200,
        height: 42,
        subtreeHeight: 42
      };

      const props = n.data.properties || [];
      const meths = n.data.methods || [];

      if (isNodeActive) {
        const showProps = props.slice(0, 5);
        showProps.forEach((p: any) => {
          const isHighlighted = activeLeafNameVal === p.name;
          classNode.children.push({
            id: `${classNodeId}-prop-${p.name}`,
            name: p.name,
            nameOnly: p.name,
            type: 'property',
            children: [],
            width: 150,
            height: 24,
            subtreeHeight: 24,
            isHighlighted
          });
        });
        if (props.length > 5) {
          classNode.children.push({
            id: `${classNodeId}-prop-more`,
            name: `+${props.length - 5} more properties`,
            type: 'more',
            children: [],
            width: 140,
            height: 22,
            subtreeHeight: 22
          });
        }

        const showMeths = meths.slice(0, 5);
        showMeths.forEach((m: any) => {
          const isHighlighted = activeLeafNameVal === m.name;
          classNode.children.push({
            id: `${classNodeId}-meth-${m.name}`,
            name: `${m.name}()`,
            nameOnly: m.name,
            type: 'method',
            children: [],
            width: 150,
            height: 24,
            subtreeHeight: 24,
            isHighlighted
          });
        });
        if (meths.length > 5) {
          classNode.children.push({
            id: `${classNodeId}-meth-more`,
            name: `+${meths.length - 5} more methods`,
            type: 'more',
            children: [],
            width: 140,
            height: 22,
            subtreeHeight: 22
          });
        }
      } 
      else if (isNodeRelated && activeLeafNameVal) {
        const matchingProp = props.find((p: any) => p.name === activeLeafNameVal);
        if (matchingProp) {
          classNode.children.push({
            id: `${classNodeId}-prop-${matchingProp.name}`,
            name: matchingProp.name,
            nameOnly: matchingProp.name,
            type: 'property',
            children: [],
            width: 150,
            height: 24,
            subtreeHeight: 24,
            isHighlighted: true
          });
        }
        const matchingMeth = meths.find((m: any) => m.name === activeLeafNameVal);
        if (matchingMeth) {
          classNode.children.push({
            id: `${classNodeId}-meth-${matchingMeth.name}`,
            name: `${matchingMeth.name}()`,
            nameOnly: matchingMeth.name,
            type: 'method',
            children: [],
            width: 150,
            height: 24,
            subtreeHeight: 24,
            isHighlighted: true
          });
        }
      }

      currentParent.children.push(classNode);
    });

    return rootNode;
  }

  function measureNodeHeight(n: TreeNode): number {
    if (!n.children || n.children.length === 0 || (n.type === 'directory' && !expandedNodes.value.has(n.id))) {
      n.subtreeHeight = n.height;
      return n.height;
    }
    let totalChildHeight = 0;
    n.children.forEach((child, index) => {
      const childHeight = measureNodeHeight(child);
      const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
      totalChildHeight += childHeight;
      if (index < n.children.length - 1) {
        totalChildHeight += gap;
      }
    });
    n.subtreeHeight = Math.max(n.height, totalChildHeight);
    return n.subtreeHeight;
  }

  function positionSubtree(node: TreeNode, x: number, y: number, side: 'left' | 'right') {
    node.x = x;
    node.y = y;
    
    if (!node.children || node.children.length === 0 || (node.type === 'directory' && !expandedNodes.value.has(node.id))) return;
    
    let totalChildHeight = 0;
    node.children.forEach((child, index) => {
      const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
      totalChildHeight += child.subtreeHeight;
      if (index < node.children.length - 1) {
        totalChildHeight += gap;
      }
    });
    
    let childStartY = y - totalChildHeight / 2;
    
    node.children.forEach((child) => {
      const gap = (child.type === 'property' || child.type === 'method' || child.type === 'more') ? 6 : 10;
      const childX = side === 'right'
        ? x + node.width + COL_GAP
        : x - child.width - COL_GAP;
      const childY = childStartY + child.subtreeHeight / 2;
      positionSubtree(child, childX, childY, side);
      childStartY += child.subtreeHeight + gap;
    });
  }

  function flattenTree(
    node: TreeNode,
    parentId: string | null,
    side: 'left' | 'right',
    outNodes: any[],
    outEdges: any[]
  ) {
    let type = 'customClass';
    if (node.type === 'root') {
      type = 'customClass';
    } else if (node.type === 'directory') {
      type = 'customDirectory';
    } else if (node.type === 'property' || node.type === 'method' || node.type === 'more') {
      type = 'customLeaf';
    }

    outNodes.push({
      id: node.id,
      type,
      position: { x: node.x ?? 0, y: node.y ?? 0 },
      data: {
        name: node.name,
        filePath: node.filePath,
        isRoot: node.type === 'root',
        isMethod: node.type === 'method',
        isMore: node.type === 'more',
        nameOnly: node.nameOnly,
        isHighlighted: node.isHighlighted,
        isVulnerable: node.classData?.isVulnerable || false,
        branchColor: node.branchColor,
        depth: node.depth,
        ...(node.classData || {})
      }
    });

    if (parentId) {
      const isLeafEdge = node.type === 'property' || node.type === 'method' || node.type === 'more';
      const color = node.branchColor || '#7C3AED';
      outEdges.push({
        id: `edge-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        style: {
          stroke: color + (isLeafEdge ? '55' : 'bb'),
          strokeWidth: isLeafEdge ? 1.0 : (node.type === 'directory' ? 2.2 : 1.5),
          strokeDasharray: isLeafEdge ? '4,4' : undefined,
          opacity: isLeafEdge ? 0.7 : 0.85
        }
      });
    }

    // IF THE NODE IS COLLAPSED, DO NOT FLATTEN ITS CHILDREN!
    if (node.type === 'directory' && !expandedNodes.value.has(node.id)) {
      return;
    }

    node.children.forEach(child => {
      flattenTree(child, node.id, side, outNodes, outEdges);
    });
  }

  function buildClassGraph(rawNodes: any[]) {
    if (!rawNodes.length) return { nodes: [], edges: [] };

    const rootNode = buildClassTree(rawNodes, activeNodeId.value, activeLeafName.value, props.initialEdges);

    rootNode.children.forEach((child, index) => {
      const branchColor = COLORS[index % COLORS.length];
      const assignBranchColors = (n: TreeNode, col: string) => {
        n.branchColor = col;
        n.children.forEach(c => assignBranchColors(c, col));
      };
      assignBranchColors(child, branchColor);
    });

    measureNodeHeight(rootNode);

    const leftChildren: TreeNode[] = [];
    const rightChildren: TreeNode[] = [];

    const countDescendants = (n: TreeNode): number => {
      let count = 1;
      n.children.forEach(c => count += countDescendants(c));
      return count;
    };

    const sortedRootChildren = [...rootNode.children].sort((a, b) => {
      return countDescendants(b) - countDescendants(a);
    });

    let leftWeight = 0;
    let rightWeight = 0;

    sortedRootChildren.forEach(child => {
      const w = countDescendants(child);
      if (leftWeight <= rightWeight) {
        leftChildren.push(child);
        leftWeight += w;
      } else {
        rightChildren.push(child);
        rightWeight += w;
      }
    });

    const outN: any[] = [];
    const outE: any[] = [];

    rootNode.x = -ROOT_W / 2;
    rootNode.y = -NODE_H / 2;

    outN.push({
      id: rootNode.id,
      type: 'customClass',
      position: { x: rootNode.x, y: rootNode.y },
      data: {
        name: rootNode.name,
        isRoot: true,
        branchColor: '#7C3AED',
        isVulnerable: rootNode.classData?.isVulnerable || false
      }
    });

    const GRP_GAP_TREE = 40;

    if (rightChildren.length > 0) {
      let totalRightHeight = 0;
      rightChildren.forEach((child, index) => {
        totalRightHeight += child.subtreeHeight;
        if (index < rightChildren.length - 1) {
          totalRightHeight += GRP_GAP_TREE;
        }
      });
      let rightStartY = -totalRightHeight / 2;
      rightChildren.forEach(child => {
        const childX = ROOT_W / 2 + COL_GAP;
        const childY = rightStartY + child.subtreeHeight / 2;
        positionSubtree(child, childX, childY, 'right');
        rightStartY += child.subtreeHeight + GRP_GAP_TREE;
      });
    }

    if (leftChildren.length > 0) {
      let totalLeftHeight = 0;
      leftChildren.forEach((child, index) => {
        totalLeftHeight += child.subtreeHeight;
        if (index < leftChildren.length - 1) {
          totalLeftHeight += GRP_GAP_TREE;
        }
      });
      let leftStartY = -totalLeftHeight / 2;
      leftChildren.forEach(child => {
        const childX = -ROOT_W / 2 - COL_GAP - child.width;
        const childY = leftStartY + child.subtreeHeight / 2;
        positionSubtree(child, childX, childY, 'left');
        leftStartY += child.subtreeHeight + GRP_GAP_TREE;
      });
    }

    leftChildren.forEach(child => {
      flattenTree(child, rootNode.id, 'left', outN, outE);
    });

    rightChildren.forEach(child => {
      flattenTree(child, rootNode.id, 'right', outN, outE);
    });

    const nodeIds = new Set(outN.map(n => n.id));
    props.initialEdges.forEach(e => {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        const type = e.data?.type || 'uses';
        let strokeColor = '#8F9CAE';
        let strokeWidth = 1.2;
        let strokeDash = undefined;
        
        if (type === 'extends') {
          strokeColor = '#FFB800';
          strokeWidth = 1.6;
        } else if (type === 'implements') {
          strokeColor = '#00E0FF';
          strokeWidth = 1.6;
        } else if (type === 'uses') {
          strokeDash = '5,5';
        }

        outE.push({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          style: {
            stroke: strokeColor,
            strokeWidth,
            strokeDasharray: strokeDash,
            opacity: 0.85
          },
          data: e.data
        });
      }
    });

    if (activeNodeId.value && activeLeafName.value) {
      const activeLeafNode = outN.find(n =>
        n.id.startsWith(activeNodeId.value + '-') &&
        (n.id.endsWith('-prop-' + activeLeafName.value) || n.id.endsWith('-meth-' + activeLeafName.value))
      );
      
      if (activeLeafNode) {
        outN.forEach(n => {
          if (n.id !== activeLeafNode.id &&
              (n.id.endsWith('-prop-' + activeLeafName.value) || n.id.endsWith('-meth-' + activeLeafName.value)) &&
              n.type === 'customLeaf') {
            outE.push({
              id: `leaf-link-${activeLeafNode.id}-${n.id}`,
              source: activeLeafNode.id,
              target: n.id,
              type: 'smoothstep',
              style: {
                stroke: '#00E0FF',
                strokeWidth: 2.2,
                strokeDasharray: '4,4',
                opacity: 1.0
              }
            });
          }
        });
      }
    }

    return { nodes: outN, edges: outE };
  }

  // ──────────────────────────────────────────────
  // Directory-tree graph builder (recursive)
  // ──────────────────────────────────────────────
  let _dtId = 0;
  function measureTree(node: any): number {
    if (!node.children?.length || !expandedNodes.value.has(node._id)) { node._h = NODE_H; return NODE_H; }
    let h = 0;
    node.children.forEach((c: any) => { h += measureTree(c) + ROW_GAP; });
    h = Math.max(NODE_H, h - ROW_GAP);
    node._h = h;
    return h;
  }
  function placeTree(node: any, x: number, cy: number, depth: number, outN: any[], outE: any[]) {
    node._id = node._id || `dt-${_dtId++}`;
    const isExpanded = expandedNodes.value.has(node._id);
    outN.push({
      id: node._id, type: depth === 0 ? 'customClass' : (node.isLeaf ? 'customClass' : 'customDirectory'),
      position: { x, y: cy - NODE_H / 2 },
      data: { ...node, depth, branchColor: COLORS[depth % COLORS.length] },
    });
    if (!node.children?.length || !isExpanded) return;
    const col  = x + NODE_W + COL_GAP;
    let   curY = cy - node._h / 2;
    node.children.forEach((c: any) => {
      const ccy = curY + c._h / 2;
      outE.push({
        id: `de-${node._id}-${c._id || `dt-${_dtId}`}`,
        source: node._id, target: c._id || `dt-${_dtId}`,
        type: 'smoothstep',
        style: { stroke: COLORS[depth % COLORS.length] + '99', strokeWidth: 1.5 },
      });
      placeTree(c, col, ccy, depth + 1, outN, outE);
      curY += c._h + ROW_GAP;
    });
  }
  function buildDirGraph(root: any) {
    if (!root) return { nodes: [], edges: [] };
    _dtId = 0; measureTree(root);
    const outN: any[] = [], outE: any[] = [];
    placeTree(root, 0, root._h / 2, 0, outN, outE);
    return { nodes: outN, edges: outE };
  }


  return { buildClassTree, buildClassGraph, buildDirGraph };
}
