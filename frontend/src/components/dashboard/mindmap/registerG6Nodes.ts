/**
 * Registers the custom G6 node shape used by the mindmap / neural map.
 * Imported for its side effect (G6.registerNode runs once when first imported).
 */
import G6 from '@antv/g6';

// ──────────────────────────────────────────────
// G6 Neural Map Node Registration
// ──────────────────────────────────────────────
G6.registerNode('custom-g6-node', {
  draw(cfg: any, group: any) {
    const isDark = document.documentElement.classList.contains('dark');
    const type = cfg.nodeType || 'class';
    const isRoot = cfg.isRoot;
    const name = cfg.name || '';
    const filePath = cfg.filePath || '';
    const isHighlighted = cfg.isHighlighted;
    const isDimmed = cfg.isDimmed;
    const isVulnerable = cfg.isVulnerable;
    const branchColor = cfg.branchColor || '#7C3AED';
    const width = cfg.width || 200;
    const height = cfg.height || 42;
    
    // Dimmed state opacity
    const opacity = isDimmed ? 0.15 : 1.0;

    // Background styling
    let fill = isDark ? '#1E293B' : '#FFFFFF';
    let stroke = branchColor;
    let strokeWidth = 1.8;
    
    const relType = cfg.relType;
    let shadowColor = 'rgba(0, 0, 0, 0.12)';
    let shadowBlur = 4;

    if (isVulnerable) {
      stroke = '#EF4444'; // Red-500
      strokeWidth = 3.0;
      fill = isDark ? '#450a0a' : '#fef2f2';
      shadowColor = '#EF4444';
      shadowBlur = 16;
    } else if (isHighlighted) {
      stroke = '#00E0FF';
      strokeWidth = 2.5;
      shadowColor = '#00E0FF';
      shadowBlur = 14;
    } else if (relType) {
      strokeWidth = 2.2;
      shadowBlur = 8;
      if (relType === 'extends') {
        stroke = '#FFB800'; // Extends: Yellow
        shadowColor = '#FFB800';
      } else if (relType === 'implements') {
        stroke = '#00E0FF'; // Implements: Blue-cyan
        shadowColor = '#00E0FF';
      } else {
        stroke = '#8F9CAE'; // Uses: Gray
        shadowColor = '#8F9CAE';
      }
    } else if (type === 'leaf') {
      stroke = branchColor + '55';
      strokeWidth = 1;
      fill = isDark ? '#1E293B88' : '#F1F5F9';
    } else if (type === 'directory') {
      fill = isDark ? '#334155' : '#F8FAFC';
    }

    const keyShape = group.addShape('rect', {
      attrs: {
        x: -width / 2,
        y: -height / 2,
        width,
        height,
        fill,
        stroke,
        lineWidth: strokeWidth,
        radius: isRoot ? 12 : (type === 'directory' ? 8 : (type === 'leaf' ? 4 : 6)),
        opacity,
        shadowColor,
        shadowBlur,
      },
      name: 'node-rect',
    });

    // Node icon
    let icon = '📄';
    if (isVulnerable) icon = '🛡️';
    else if (isRoot) icon = '⬡';
    else if (type === 'directory') {
      icon = cfg.isLeaf ? '📄' : (cfg.isExpanded ? '📂' : '📁');
    }
    else if (type === 'leaf') {
      icon = cfg.isMore ? '🔸' : (cfg.isMethod ? '⚡' : '⚙️');
    }

    group.addShape('text', {
      attrs: {
        x: -width / 2 + 10,
        y: 0,
        text: icon,
        fontSize: type === 'leaf' ? 10 : 12,
        textAlign: 'left',
        textBaseline: 'middle',
        fill: branchColor,
        opacity,
      },
      name: 'node-icon',
    });

    // Node title
    let titleFill = isDark ? '#F8FAFC' : '#0F172A';
    if (type === 'leaf') {
      titleFill = isDark ? '#CBD5E1' : '#475569';
    }
    
    group.addShape('text', {
      attrs: {
        x: -width / 2 + (type === 'leaf' ? 24 : 28),
        y: filePath ? -6 : 0,
        text: name.length > 20 ? name.substring(0, 18) + '...' : name,
        fontSize: type === 'leaf' ? 8.5 : 10.5,
        fontFamily: type === 'leaf' ? 'JetBrains Mono, Fira Code, monospace' : 'system-ui, -apple-system, sans-serif',
        fontWeight: isRoot ? 'bold' : '600',
        textAlign: 'left',
        textBaseline: 'middle',
        fill: titleFill,
        opacity,
      },
      name: 'node-title',
    });

    // Node path subtitle
    if (filePath) {
      const displayPath = filePath.split('/').pop() || '';
      group.addShape('text', {
        attrs: {
          x: -width / 2 + 28,
          y: 8,
          text: displayPath.length > 22 ? displayPath.substring(0, 20) + '...' : displayPath,
          fontSize: 7.5,
          textAlign: 'left',
          textBaseline: 'middle',
          fill: isDark ? '#94A3B8' : '#64748B',
          opacity,
        },
        name: 'node-subtitle',
      });
    }

    return keyShape;
  }
});
