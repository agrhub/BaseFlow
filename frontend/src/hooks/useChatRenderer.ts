import { nextTick } from 'vue';
import { store } from '../stores';
import { ElMessage } from 'element-plus';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import axios from 'axios';
import router from '../router';

const md = new MarkdownIt({ html: true, linkify: true });

export function useChatRenderer() {
  // Helper lookup to find matching files from sidebarList
  const findFileMatch = (pathStr: string) => {
    const normalizedPath = pathStr.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    for (const [folder, files] of Object.entries(store.sidebarList || {})) {
      for (const file of files) {
        if (file.toLowerCase() === filename.toLowerCase()) {
          const fullPath = folder === 'root' ? file : `${folder}/${file}`;
          if (fullPath.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
            return { folder, filename: file };
          }
        }
      }
    }
    return null;
  };



  const handleChatClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 1. Handle Copy Code Button Click (delegated event)
    const copyBtn = target.closest('.code-copy-btn') as HTMLButtonElement;
    if (copyBtn) {
      e.preventDefault();
      const wrapper = copyBtn.closest('.code-block-wrapper');
      if (wrapper) {
        const pre = wrapper.querySelector('pre');
        if (pre) {
          const codeElement = pre.querySelector('code');
          const codeText = (codeElement ? codeElement.textContent : pre.textContent) || '';
          const cleanText = codeText.replace(/\n$/, '');
          
          const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          
          navigator.clipboard.writeText(cleanText).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `${checkIcon} <span>Copied!</span>`;
            
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.innerHTML = `${copyIcon} <span>Copy</span>`;
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy: ', err);
            ElMessage.error(store.t('Failed to copy to clipboard.'));
          });
        }
      }
      return;
    }

    // 2. Handle Standard Anchors with custom URL schemes
    const anchor = target.closest('a') as HTMLAnchorElement;
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      
      if (href.startsWith('file:///')) {
        e.preventDefault();
        const filePath = href.replace('file:///', '');
        const fileMatch = findFileMatch(filePath);
        if (fileMatch) {
          store.setFolder(fileMatch.folder);
          store.setItem(fileMatch.filename);
          const encodedDb = fileMatch.folder && fileMatch.folder !== 'root' ? fileMatch.folder.replace(/\//g, '_') : 'root';
          router.push(`/${store.activeConnection}/explorer/${encodedDb}/${fileMatch.filename}`);
          ElMessage.success(store.t('Opening file: {file}').replace('{file}', fileMatch.filename));
        } else {
          // Parse folder and filename from path directly
          const normalizedPath = filePath.replace(/\\/g, '/');
          const lastSlash = normalizedPath.lastIndexOf('/');
          const folder = lastSlash !== -1 ? normalizedPath.substring(0, lastSlash) : 'root';
          const filename = lastSlash !== -1 ? normalizedPath.substring(lastSlash + 1) : normalizedPath;
          
          store.setFolder(folder);
          store.setItem(filename);
          const encodedDb = folder && folder !== 'root' ? folder.replace(/\//g, '_') : 'root';
          router.push(`/${store.activeConnection}/explorer/${encodedDb}/${filename}`);
          ElMessage.success(store.t('Opening file: {file}').replace('{file}', filename));
        }
        return;
      }
      
      if (href.startsWith('class:')) {
        e.preventDefault();
        const clsName = href.replace('class:', '');
        store.activeTab = 'mindmap';
        store.selectedMindmapNode = clsName;
        ElMessage.success(store.t('Inspecting codebase class: {class}').replace('{class}', clsName));
        return;
      }
      
      if (href.startsWith('method:')) {
        e.preventDefault();
        const methodVal = href.replace('method:', '');
        const dotIdx = methodVal.indexOf('.');
        if (dotIdx !== -1) {
          const clsName = methodVal.substring(0, dotIdx);
          const methodName = methodVal.substring(dotIdx + 1);
          store.activeTab = 'mindmap';
          store.selectedMindmapNode = clsName;
          store.setSelectedMethod(methodName);
          ElMessage.success(store.t('Inspecting method: {method}').replace('{method}', methodName));
        } else {
          store.setSelectedMethod(methodVal);
        }
        return;
      }
      
      if (href.startsWith('prop:')) {
        e.preventDefault();
        const propVal = href.replace('prop:', '');
        const dotIdx = propVal.indexOf('.');
        if (dotIdx !== -1) {
          const clsName = propVal.substring(0, dotIdx);
          const propName = propVal.substring(dotIdx + 1);
          store.activeTab = 'mindmap';
          store.selectedMindmapNode = clsName;
          store.setSelectedMethod(propName);
          ElMessage.success(store.t('Inspecting property: {prop}').replace('{prop}', propName));
        } else {
          store.setSelectedMethod(propVal);
        }
        return;
      }
    }

    // 3. Handle Entity Links Click
    const link = target.closest('.entity-link') as HTMLElement;
    if (!link) return;
    
    e.preventDefault();
    const clsName = link.dataset.class;
    const methodName = link.dataset.method;
    const propName = link.dataset.property;
    const folderName = link.dataset.folder;
    const fileName = link.dataset.file;

    // Handle file click and navigation
    if (folderName && fileName) {
      store.setFolder(folderName);
      store.setItem(fileName);
      const encodedDb = folderName && folderName !== 'root' ? folderName.replace(/\//g, '_') : 'root';
      router.push(`/${store.activeConnection}/explorer/${encodedDb}/${fileName}`);
      ElMessage.success(store.t('Opening file: {file}').replace('{file}', fileName));
      return;
    }
    
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

      // 1. Replace Markdown links referencing playbooks (to avoid nested rendering inside href attributes)
      clean = clean.replace(/\[([^\]]*skills\/[\w_.-]+\.md)\]\(file:\/\/[^)]+\)/gi, (_match, textContent) => {
        const cleanText = textContent.replace(/^[📄\s]+/u, '');
        const id = `@@@PLAYBOOK_PH_${placeholderCounter++}@@@`;
        playbookBlocks[id] = `<span class="entity-link playbook-link" data-path="skills/${cleanText.replace(/^skills\//, '')}">📄 skills/${cleanText.replace(/^skills\//, '')}</span>`;
        return id;
      });

      // 2. Replace plain playbook paths
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

      let rendered = md.render(clean);

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

      // Wrap standard code blocks and inject Copy button
      const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      rendered = rendered.replace(/<pre><code([\s\S]*?)>([\s\S]*?)<\/code><\/pre>/gi, (_match: string, attrs: string, codeContent: string) => {
        return `<div class="code-block-wrapper"><pre><code${attrs}>${codeContent}</code></pre><button class="code-copy-btn">${copyIcon} <span>Copy</span></button></div>`;
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
