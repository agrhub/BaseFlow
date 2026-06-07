import { nextTick } from 'vue';
import { store } from '../stores';
import { ElMessage } from 'element-plus';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import axios from 'axios';

const md = new MarkdownIt({ html: true, linkify: true });

export function useChatRenderer() {
  const linkifyEntities = (text: string) => {
    if (!store.classesData || store.classesData.length === 0) {
      return text;
    }

    const classesList: string[] = [];
    const methodsMap = new Map<string, string>();
    const propertiesMap = new Map<string, string>();

    store.classesData.forEach((node: any) => {
      const cls = node.data;
      if (!cls) return;
      classesList.push(cls.name);
      
      if (Array.isArray(cls.methods)) {
        cls.methods.forEach((m: any) => {
          if (m.name && m.name !== 'constructor') {
            methodsMap.set(m.name, cls.name);
          }
        });
      }
      if (Array.isArray(cls.properties)) {
        cls.properties.forEach((p: any) => {
          if (p.name) {
            propertiesMap.set(p.name, cls.name);
          }
        });
      }
    });

    classesList.sort((a, b) => b.length - a.length);
    const sortedMethods = Array.from(methodsMap.keys()).sort((a, b) => b.length - a.length);
    const sortedProperties = Array.from(propertiesMap.keys()).sort((a, b) => b.length - a.length);

    // Tokenize code blocks
    const codeRegex = /(```[\s\S]*?```|`[^`\n]*?`)/g;
    const parts = text.split(codeRegex);

    const placeholders: { [key: string]: string } = {};
    let placeholderCounter = 0;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('`')) {
        continue;
      }

      let segment = parts[i];

      // Match class names
      classesList.forEach(clsName => {
        const classRegex = new RegExp(`\\b${clsName}\\b`, 'g');
        segment = segment.replace(classRegex, () => {
          const id = `@@@CLASS_PH_${placeholderCounter++}@@@`;
          placeholders[id] = `<span class="entity-link class-link" data-class="${clsName}">${clsName}</span>`;
          return id;
        });
      });

      // Match methods with ()
      sortedMethods.forEach(methodName => {
        const clsName = methodsMap.get(methodName);
        const regex = new RegExp(`\\b${methodName}\\(\\)` , 'g');
        segment = segment.replace(regex, () => {
          const id = `@@@METHOD_PH_${placeholderCounter++}@@@`;
          placeholders[id] = `<span class="entity-link method-link" data-class="${clsName}" data-method="${methodName}">${methodName}()</span>`;
          return id;
        });
      });

      // Match methods without ()
      sortedMethods.forEach(methodName => {
        const clsName = methodsMap.get(methodName);
        const regex = new RegExp(`\\b${methodName}\\b` , 'g');
        segment = segment.replace(regex, () => {
          const id = `@@@METHOD_PH_${placeholderCounter++}@@@`;
          placeholders[id] = `<span class="entity-link method-link" data-class="${clsName}" data-method="${methodName}">${methodName}</span>`;
          return id;
        });
      });

      // Match properties
      sortedProperties.forEach(propertyName => {
        const clsName = propertiesMap.get(propertyName);
        const regex = new RegExp(`\\b${propertyName}\\b` , 'g');
        segment = segment.replace(regex, () => {
          const id = `@@@PROP_PH_${placeholderCounter++}@@@`;
          placeholders[id] = `<span class="entity-link property-link" data-class="${clsName}" data-property="${propertyName}">${propertyName}</span>`;
          return id;
        });
      });

      // Restore placeholders
      let restored = true;
      while (restored) {
        restored = false;
        Object.keys(placeholders).forEach(id => {
          if (segment.includes(id)) {
            segment = segment.replace(id, placeholders[id]);
            restored = true;
          }
        });
      }

      parts[i] = segment;
    }

    return parts.join('');
  };

  const handleChatClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('.entity-link') as HTMLElement;
    if (!link) return;
    
    e.preventDefault();
    const clsName = link.dataset.class;
    const methodName = link.dataset.method;
    const propName = link.dataset.property;
    
    if (clsName) {
      store.activeTab = 'mindmap';
      store.selectedMindmapNode = clsName;
      ElMessage.success(store.t('Inspecting codebase class: {class}').replace('{class}', clsName));
      
      if (methodName) {
        store.setSelectedMethod(methodName);
      } else if (propName) {
        store.setSelectedMethod(propName);
      } else {
        store.setSelectedMethod('');
      }
    }

    const playbookLink = target.closest('.playbook-link') as HTMLElement;
    if (playbookLink) {
      const path = playbookLink.dataset.path;
      if (path) {
        axios.get(`/api/${store.activeConnection}/documents/content?path=${encodeURIComponent(path)}`)
          .then((res: any) => {
            store.playbookToReview = { title: store.t('Review Document'), content: res.data.content, filePath: path };
          }).catch(() => {
            ElMessage.error(store.t('Failed to load document.'));
          });
      }
    }
  };

  const renderMarkdown = (text: string) => {
    try {
      let clean = text
        .replace(/\[SUGGESTIONS\][\s\S]*?\[\/SUGGESTIONS\]/gi, '')
        .replace(/\[SUGGESTIONS\][\s\S]*/gi, '')
        .replace(/\[NAVIGATE\][\s\S]*?\[\/NAVIGATE\]/gi, '')
        .replace(/\[NAVIGATE\][\s\S]*/gi, '')
        .replace(/\[NAVIGATION\][\s\S]*?\[\/NAVIGATION\]/gi, '')
        .replace(/\[NAVIGATION\][\s\S]*/gi, '')
        .trim();

      const mermaidBlocks: Record<string, string> = {};
      const chartBlocks: Record<string, string> = {};

      // Fix missing newlines in bulleted lists
      clean = clean.replace(/(\*|\d+\.) ([A-Z][a-zA-Z\s]+:)/g, '\n$1 $2');

      const playbookBlocks: Record<string, string> = {};
      let placeholderCounter = 0;
      clean = clean.replace(/\b(skills\/[\w_.-]+\.md)\b/g, (match, path) => {
        const id = `@@@PLAYBOOK_PH_${placeholderCounter++}@@@`;
        playbookBlocks[id] = `<span class="entity-link playbook-link" data-path="${path}">📄 ${match}</span>`;
        return id;
      });

      // Intercept mermaid blocks
      clean = clean.replace(/```mermaid\n([\s\S]*?)\n```/gi, (_match, code) => {
        const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
        const html = `<div class="mermaid-render-block" id="${id}" data-processed="false" data-code="${encodeURIComponent(code)}">
          <div class="mermaid-loading"><span class="rotating-icon">🔄</span> ${store.t('Rendering diagram...')}</div>
        </div>`;
        const ph = `@@@MERMAID_PH_${id}@@@`;
        mermaidBlocks[ph] = html;
        return `\n\n${ph}\n\n`;
      });

      // Intercept custom chart blocks
      clean = clean.replace(/```chart\n([\s\S]*?)\n```/gi, (_match, jsonStr) => {
        const id = 'chart-' + Math.random().toString(36).substring(2, 11);
        const html = `<div class="chart-render-block" id="${id}" data-processed="false" data-json="${encodeURIComponent(jsonStr)}">
          <div class="mermaid-loading">📊 ${store.t('Parsing chart...')}</div>
        </div>`;
        const ph = `@@@CHART_PH_${id}@@@`;
        chartBlocks[ph] = html;
        return `\n\n${ph}\n\n`;
      });

      const linkified = linkifyEntities(clean);
      let rendered = md.render(linkified);

      Object.keys(playbookBlocks).forEach(ph => {
        rendered = rendered.replace(new RegExp(`<p>${ph}</p>`, 'g'), playbookBlocks[ph]);
        rendered = rendered.replace(new RegExp(ph, 'g'), playbookBlocks[ph]);
      });
      Object.keys(mermaidBlocks).forEach(ph => {
        rendered = rendered.replace(new RegExp(`<p>${ph}</p>`, 'g'), mermaidBlocks[ph]);
        rendered = rendered.replace(new RegExp(ph, 'g'), mermaidBlocks[ph]);
      });
      Object.keys(chartBlocks).forEach(ph => {
        rendered = rendered.replace(new RegExp(`<p>${ph}</p>`, 'g'), chartBlocks[ph]);
        rendered = rendered.replace(new RegExp(ph, 'g'), chartBlocks[ph]);
      });

      return rendered;
    } catch (e) {
      return text;
    }
  };

  const renderVisualBlocks = async (onDone?: () => void) => {
    await nextTick();
    
    // 1. Render Mermaid diagrams
    const mermaidBlocks = document.querySelectorAll('.mermaid-render-block[data-processed="false"]');
    for (const block of Array.from(mermaidBlocks)) {
      const el = block as HTMLElement;
      const code = decodeURIComponent(el.dataset.code || '');
      const id = el.id;
      el.setAttribute('data-processed', 'true');
      
      try {
        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose'
        });
        const { svg } = await mermaid.render(id + '-svg', code);
        el.innerHTML = `<div class="rendered-mermaid-svg">${svg}</div>`;
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        el.innerHTML = `<div class="render-error">⚠️ <strong>${store.t('Mermaid Render Error:')}</strong> ${store.t('Invalid diagram syntax.')}</div>`;
      }
    }

    // 2. Render Custom SVG Charts
    const chartBlocks = document.querySelectorAll('.chart-render-block[data-processed="false"]');
    for (const block of Array.from(chartBlocks)) {
      const el = block as HTMLElement;
      const jsonStr = decodeURIComponent(el.dataset.json || '');
      el.setAttribute('data-processed', 'true');
      
      try {
        const config = JSON.parse(jsonStr.trim());
        const title = config.title || store.t('Data Analysis');
        const type = config.type || 'bar';
        const data: Array<{ label: string; value: number }> = config.data || [];
        
        if (data.length === 0) {
          el.innerHTML = `<div class="render-error">${store.t('No data points provided for chart.')}</div>`;
          continue;
        }

        const maxVal = Math.max(...data.map(d => d.value), 1);
        let chartHtml = '';

        if (type === 'pie') {
          let cumulativePercent = 0;
          const radius = 50;
          const cx = 80;
          const cy = 80;
          const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
          
          const pieSlices = data.map((item, idx) => {
            const percent = item.value / total;
            const startPercent = cumulativePercent;
            cumulativePercent += percent;
            const endPercent = cumulativePercent;
            
            const getCoordinatesForPercent = (p: number) => {
              const x = cx + radius * Math.cos(2 * Math.PI * p - Math.PI / 2);
              const y = cy + radius * Math.sin(2 * Math.PI * p - Math.PI / 2);
              return [x, y];
            };

            const [startX, startY] = getCoordinatesForPercent(startPercent);
            const [endX, endY] = getCoordinatesForPercent(endPercent);
            const largeArcFlag = percent > 0.5 ? 1 : 0;
            
            let pathData = '';
            if (percent >= 0.999) {
              pathData = `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`;
            } else {
              pathData = [
                `M ${cx} ${cy}`,
                `L ${startX} ${startY}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                'Z'
              ].join(' ');
            }

            const colors = ['#00f2fe', '#4facfe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
            const color = colors[idx % colors.length];

            return `<path d="${pathData}" fill="${color}" stroke="var(--bg-primary)" stroke-width="1.5" />`;
          }).join('');

          const legendHtml = data.map((item, idx) => {
            const colors = ['#00f2fe', '#4facfe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
            const color = colors[idx % colors.length];
            const pct = Math.round((item.value / total) * 100);
            return `
              <div class="chart-legend-item">
                <span class="legend-color-dot" style="background: ${color}"></span>
                <span class="legend-text">${item.label}: <strong>${item.value} (${pct}%)</strong></span>
              </div>
            `;
          }).join('');

          chartHtml = `
            <div class="pie-chart-wrapper">
              <svg width="160" height="160" class="pie-svg">${pieSlices}</svg>
              <div class="chart-legend">${legendHtml}</div>
            </div>
          `;
        } else if (type === 'line') {
          const width = 320;
          const height = 120;
          const paddingX = 35;
          const paddingY = 20;
          const chartWidth = width - paddingX * 2;
          const chartHeight = height - paddingY * 2;
          const stepX = chartWidth / (data.length - 1 || 1);
          
          const points = data.map((d, idx) => ({
            x: paddingX + idx * stepX,
            y: height - paddingY - (d.value / maxVal) * chartHeight,
            label: d.label,
            value: d.value
          }));

          const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const areaPath = points.length > 0 ? `${linePath} L ${points[points.length-1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z` : '';
          
          const gridLines = [0.25, 0.5, 0.75, 1].map(pct => {
            const y = height - paddingY - pct * chartHeight;
            return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2" />`;
          }).join('');

          const dots = points.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--bg-secondary)" stroke="var(--color-brand)" stroke-width="2" />
          `).join('');

          const labels = points.map((p, idx) => {
            if (data.length > 5 && idx % 2 !== 0) return '';
            return `<text x="${p.x}" y="${height - 4}" fill="var(--text-muted)" font-size="7" text-anchor="middle">${p.label}</text>`;
          }).join('');

          chartHtml = `
            <div class="line-chart-wrapper">
              <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}">
                <defs>
                  <linearGradient id="chatLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-brand)" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="var(--color-brand)" stop-opacity="0" />
                  </linearGradient>
                </defs>
                ${gridLines}
                <path d="${areaPath}" fill="url(#chatLineGrad)" />
                <path d="${linePath}" fill="none" stroke="var(--color-brand)" stroke-width="2" />
                ${dots}
                ${labels}
                <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.15)" />
              </svg>
            </div>
          `;
        } else {
          const bars = data.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            return `
              <div class="bar-chart-row">
                <div class="bar-label-row">
                  <span class="bar-lbl">${item.label}</span>
                  <span class="bar-val">${item.value}</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          }).join('');
          
          chartHtml = `<div class="bar-chart-wrapper">${bars}</div>`;
        }

        el.innerHTML = `
          <div class="custom-rendered-chart glass-panel">
            <div class="chart-title-lbl">📊 ${title}</div>
            ${chartHtml}
          </div>
        `;
      } catch (err: any) {
        console.error('Chart render error:', err);
        el.innerHTML = `<div class="render-error">⚠️ <strong>${store.t('Chart Render Error:')}</strong> ${store.t('Invalid JSON config.')}</div>`;
      }
    }
    if (onDone) onDone();
  };

  return {
    handleChatClick,
    renderMarkdown,
    renderVisualBlocks
  };
}
