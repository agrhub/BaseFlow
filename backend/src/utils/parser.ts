import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export interface ParsedProperty {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
}

export interface ParsedMethod {
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
  visibility: 'public' | 'private' | 'protected';
}

export interface ParsedClass {
  name: string;
  filePath: string;
  baseClass?: string;
  implementsList: string[];
  properties: ParsedProperty[];
  methods: ParsedMethod[];
  dependencies: string[];
  isModule?: boolean;
}

export interface ParseResult {
  classes: ParsedClass[];
  nodes: any[];
  edges: any[];
}

export function getAllFiles(dirPath: string, extensions: string[], fileList: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return fileList;
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    if (file.startsWith('.') || ['node_modules', 'dist', 'build', 'venv', 'bin', 'obj', 'target', 'out'].includes(file)) {
      return;
    }
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllFiles(filePath, extensions, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

function parseTypeScriptFile(filePath: string, relativePath: string, content: string, classes: ParsedClass[]) {
  try {
    const initialLen = classes.length;
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    function getModifiers(node: ts.Node) {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      let visibility: 'public' | 'private' | 'protected' = 'public';
      if (modifiers) {
        for (const mod of modifiers) {
          if (mod.kind === ts.SyntaxKind.PrivateKeyword) visibility = 'private';
          if (mod.kind === ts.SyntaxKind.ProtectedKeyword) visibility = 'protected';
          if (mod.kind === ts.SyntaxKind.PublicKeyword) visibility = 'public';
        }
      }
      return { visibility };
    }

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        let baseClass: string | undefined;
        const implementsList: string[] = [];
        const properties: ParsedProperty[] = [];
        const methods: ParsedMethod[] = [];
        const dependencies = new Set<string>();

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              const firstType = clause.types[0];
              if (firstType) {
                baseClass = firstType.expression.getText(sourceFile);
                dependencies.add(baseClass);
              }
            } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
              for (const typeNode of clause.types) {
                const name = typeNode.expression.getText(sourceFile);
                implementsList.push(name);
                dependencies.add(name);
              }
            }
          }
        }

        for (const member of node.members) {
          const { visibility } = getModifiers(member);

          if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type ? member.type.getText(sourceFile) : 'any';
            properties.push({ name: propName, type: propType, visibility });

            if (member.type) {
              const typeStr = member.type.getText(sourceFile);
              const matches = typeStr.match(/\b[A-Z]\w*\b/g);
              if (matches) matches.forEach(m => dependencies.add(m));
            }
          } else if (ts.isMethodDeclaration(member)) {
            const methodName = member.name.getText(sourceFile);
            const parameters = member.parameters.map(p => {
              const paramName = p.name.getText(sourceFile);
              const paramType = p.type ? p.type.getText(sourceFile) : 'any';
              if (p.type) {
                const typeStr = p.type.getText(sourceFile);
                const matches = typeStr.match(/\b[A-Z]\w*\b/g);
                if (matches) matches.forEach(m => dependencies.add(m));
              }
              return { name: paramName, type: paramType };
            });
            const returnType = member.type ? member.type.getText(sourceFile) : 'void';
            methods.push({ name: methodName, parameters, returnType, visibility });
          } else if (ts.isConstructorDeclaration(member)) {
            const parameters = member.parameters.map(p => {
              const paramName = p.name.getText(sourceFile);
              const paramType = p.type ? p.type.getText(sourceFile) : 'any';
              if (p.type) {
                const typeStr = p.type.getText(sourceFile);
                const matches = typeStr.match(/\b[A-Z]\w*\b/g);
                if (matches) matches.forEach(m => dependencies.add(m));
              }
              return { name: paramName, type: paramType };
            });
            methods.push({ name: 'constructor', parameters, returnType: className, visibility: 'public' });
          }
        }

        const codeLines = content.split('\n');
        for (const line of codeLines) {
          if (line.trim().startsWith('import ')) {
            const matches = line.match(/\b[A-Z]\w*\b/g);
            if (matches) matches.forEach(m => dependencies.add(m));
          }
        }

        classes.push({
          name: className,
          filePath: relativePath,
          baseClass,
          implementsList,
          properties,
          methods,
          dependencies: Array.from(dependencies).filter(d => d !== className && d !== 'any' && d !== 'string' && d !== 'number' && d !== 'boolean' && d !== 'Promise' && d !== 'void')
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // If no classes were declared in this file, treat it as a module
    if (classes.length === initialLen) {
      const fileName = path.basename(filePath);
      const dependencies = new Set<string>();

      const codeLines = content.split('\n');
      for (const line of codeLines) {
        if (line.trim().startsWith('import ') || line.includes('require(')) {
          const matches = line.match(/\b[A-Z]\w*\b/g);
          if (matches) matches.forEach(m => dependencies.add(m));
          // Extract base names from from clauses
          const fileImportMatch = line.match(/from\s+['"]([^'"]+)['"]/);
          if (fileImportMatch) {
            const importedPath = fileImportMatch[1];
            const baseName = path.basename(importedPath).replace(/\.(ts|js|vue|tsx|jsx)$/, '');
            dependencies.add(baseName);
          }
        }
      }

      classes.push({
        name: fileName,
        filePath: relativePath,
        implementsList: [],
        properties: [],
        methods: [],
        dependencies: Array.from(dependencies).filter(d => d !== fileName && d !== 'any' && d !== 'string' && d !== 'number' && d !== 'boolean' && d !== 'Promise' && d !== 'void'),
        isModule: true
      });
    }
  } catch (error) {
    console.error(`Error parsing TypeScript file ${filePath}:`, error);
  }
}

function parseRegexFile(filePath: string, relativePath: string, content: string, ext: string, classes: ParsedClass[]) {
  try {
    const initialLen = classes.length;
    const lines = content.split('\n');
    let currentClass: ParsedClass | null = null;
    const dependencies = new Set<string>();

    if (ext === '.py') {
      for (const line of lines) {
        const classMatch = line.match(/^\s*class\s+(\w+)(?:\s*\(([^)]+)\))?\s*:/);
        if (classMatch) {
          if (currentClass) {
            currentClass.dependencies = Array.from(dependencies).filter(d => d !== currentClass!.name);
            classes.push(currentClass);
            dependencies.clear();
          }

          const className = classMatch[1];
          const parents = classMatch[2] ? classMatch[2].split(',').map(s => s.trim()) : [];
          const baseClass = parents[0];
          parents.forEach(p => dependencies.add(p));

          currentClass = {
            name: className,
            filePath: relativePath,
            baseClass,
            implementsList: parents.slice(1),
            properties: [],
            methods: [],
            dependencies: []
          };
        } else if (currentClass) {
          const methodMatch = line.match(/^\s+def\s+(\w+)\s*\(([^)]*)\)/);
          if (methodMatch) {
            const methodName = methodMatch[1];
            const paramsText = methodMatch[2];
            const parameters = paramsText
              .split(',')
              .map(p => p.trim())
              .filter(p => p !== 'self' && p !== '')
              .map(p => ({ name: p, type: 'any' }));

            currentClass.methods.push({
              name: methodName,
              parameters,
              returnType: 'any',
              visibility: methodName.startsWith('__') ? 'private' : methodName.startsWith('_') ? 'protected' : 'public'
            });
          }

          const propMatch = line.match(/^\s+self\.(\w+)\s*=/);
          if (propMatch) {
            const propName = propMatch[1];
            if (!currentClass.properties.some(p => p.name === propName)) {
              currentClass.properties.push({
                name: propName,
                type: 'any',
                visibility: propName.startsWith('__') ? 'private' : propName.startsWith('_') ? 'protected' : 'public'
              });
            }
          }

          // (no rawCode accumulation — read from disk on demand)
        }
      }
    } else if (ext === '.java' || ext === '.cs') {
      let braceLevel = 0;
      let classBraceLevel = 0;
      let inClass = false;

      for (const line of lines) {
        // Strip comments
        const cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
        if (!cleanLine) continue;

        // Track imports and usings globally
        const importMatch = cleanLine.match(/^import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;/);
        if (importMatch) {
          const parts = importMatch[1].split('.');
          const lastPart = parts[parts.length - 1];
          if (lastPart && /^[A-Z]/.test(lastPart)) {
            dependencies.add(lastPart);
          }
        }
        const usingMatch = cleanLine.match(/^using\s+([\w.]+)\s*;/);
        if (usingMatch) {
          const parts = usingMatch[1].split('.');
          const lastPart = parts[parts.length - 1];
          if (lastPart && /^[A-Z]/.test(lastPart)) {
            dependencies.add(lastPart);
          }
        }

        const classMatch = cleanLine.match(/(?:public|private|protected|internal|abstract|static|\s)*(?:class|interface|enum)\s+(\w+)(?:\s*:\s*([\w\s,]+))?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/);
        if (classMatch && !cleanLine.includes(';')) {
          const className = classMatch[1];
          if (className === 'Program' || className === 'Main') continue;

          if (currentClass) {
            currentClass.dependencies = Array.from(dependencies).filter(d => d !== currentClass!.name);
            classes.push(currentClass);
            dependencies.clear();
          }

          let baseClass: string | undefined;
          let implementsList: string[] = [];

          if (ext === '.cs' && classMatch[2]) {
            const parts = classMatch[2].split(',').map(s => s.trim());
            baseClass = parts[0];
            implementsList = parts.slice(1);
            parts.forEach(p => {
              const cleanP = p.trim();
              if (/^[A-Z]/.test(cleanP)) dependencies.add(cleanP);
            });
          } else {
            baseClass = classMatch[3];
            if (baseClass) dependencies.add(baseClass);
            if (classMatch[4]) {
              implementsList = classMatch[4].split(',').map(s => s.trim());
              implementsList.forEach(i => {
                const cleanI = i.trim();
                if (/^[A-Z]/.test(cleanI)) dependencies.add(cleanI);
              });
            }
          }

          currentClass = {
            name: className,
            filePath: relativePath,
            baseClass,
            implementsList,
            properties: [],
            methods: [],
            dependencies: []
          };
          classBraceLevel = braceLevel;
          inClass = true;
        }

        // Track braces
        const openBraces = (cleanLine.match(/\{/g) || []).length;
        const closeBraces = (cleanLine.match(/\}/g) || []).length;
        const prevBraceLevel = braceLevel;
        braceLevel += openBraces - closeBraces;

        if (inClass && currentClass) {
          // Exited class body
          if (braceLevel <= classBraceLevel) {
            currentClass.dependencies = Array.from(dependencies)
              .filter(d => d !== currentClass!.name && /^[A-Z]/.test(d) && !['String', 'List', 'Map', 'Set', 'Object', 'Boolean', 'Integer', 'Double', 'Float', 'Long', 'Short', 'Byte', 'Character', 'Override'].includes(d));
            classes.push(currentClass);
            currentClass = null;
            inClass = false;
            dependencies.clear();
            continue;
          }

          // Parse methods & properties only if directly inside class level
          if (prevBraceLevel === classBraceLevel + 1) {
            // Parse methods
            const methodMatch = cleanLine.match(/(public|private|protected)?\s+(?:static\s+)?(?:final\s+|volatile\s+|synchronized\s+)*([\w<>]+)\s+(\w+)\s*\(([^)]*)\)\s*[\{;]?/);
            if (methodMatch && !cleanLine.includes('class') && !cleanLine.includes('return') && !cleanLine.includes('new ')) {
              const visibility = (methodMatch[1] || 'public') as 'public' | 'private' | 'protected';
              const returnType = methodMatch[2];
              const methodName = methodMatch[3];
              const paramsText = methodMatch[4];

              if (methodName !== 'if' && methodName !== 'while' && methodName !== 'for' && methodName !== 'switch' && methodName !== 'catch') {
                const parameters = paramsText
                  .split(',')
                  .map(p => p.trim())
                  .filter(p => p !== '')
                  .map(p => {
                    const parts = p.trim().split(/\s+/);
                    const type = parts.slice(0, -1).join(' ') || 'any';
                    const name = parts[parts.length - 1] || 'param';
                    const cleanType = type.replace(/<.*>/, '').replace(/\[\]/, '').trim();
                    if (/^[A-Z]/.test(cleanType)) {
                      dependencies.add(cleanType);
                    }
                    return { name, type };
                  });

                const cleanReturn = returnType.replace(/<.*>/, '').replace(/\[\]/, '').trim();
                if (/^[A-Z]/.test(cleanReturn)) {
                  dependencies.add(cleanReturn);
                }

                currentClass.methods.push({
                  name: methodName,
                  parameters,
                  returnType,
                  visibility
                });
              }
            }

            // Parse properties
            const fieldMatch = cleanLine.match(/(public|private|protected)?\s+(?:static\s+)?(?:final\s+|volatile\s+|transient\s+)*([\w<>]+)\s+(\w+)\s*(?:;|=|\{)/);
            if (fieldMatch && !cleanLine.includes('return') && !cleanLine.includes('class') && !cleanLine.includes('(') && !cleanLine.includes('}')) {
              const visibility = (fieldMatch[1] || 'public') as 'public' | 'private' | 'protected';
              const propType = fieldMatch[2];
              const propName = fieldMatch[3];

              if (propName !== 'return' && propName !== 'new' && propName !== 'class') {
                currentClass.properties.push({
                  name: propName,
                  type: propType,
                  visibility
                });
                const cleanProp = propType.replace(/<.*>/, '').replace(/\[\]/, '').trim();
                if (/^[A-Z]/.test(cleanProp)) {
                  dependencies.add(cleanProp);
                }
              }
            }
          }
        }
      }
    } else if (ext === '.rs') {
      const structRegex = /(?:pub(?:\([^)]+\))?\s+)?(?:struct|enum|trait)\s+(\w+)/g;
      let match;
      const fileClasses: { [name: string]: ParsedClass } = {};
      
      while ((match = structRegex.exec(content)) !== null) {
        const name = match[1];
        fileClasses[name] = {
          name,
          filePath: relativePath,
          properties: [],
          methods: [],
          implementsList: [],
          dependencies: []
        };
      }

      const implRegex = /impl(?:\s+[\w<>, ]+)?\s+(?:([\w<>]+)\s+for\s+)?([\w<>]+)/g;
      let implMatch;
      while ((implMatch = implRegex.exec(content)) !== null) {
        const traitName = implMatch[1];
        const structNameRaw = implMatch[2];
        const structName = structNameRaw.replace(/<.*>/, '').trim();

        let targetClass = fileClasses[structName];
        if (!targetClass) {
          targetClass = {
            name: structName,
            filePath: relativePath,
            properties: [],
            methods: [],
            implementsList: [],
            dependencies: []
          };
          fileClasses[structName] = targetClass;
        }

        if (traitName) {
          const cleanTrait = traitName.replace(/<.*>/, '').trim();
          if (!targetClass.implementsList.includes(cleanTrait)) {
            targetClass.implementsList.push(cleanTrait);
          }
        }

        const startIndex = implMatch.index + implMatch[0].length;
        let braceCount = 0;
        let endIndex = -1;
        for (let i = startIndex; i < content.length; i++) {
          if (content[i] === '{') braceCount++;
          else if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }

        if (endIndex !== -1) {
          const blockContent = content.substring(startIndex, endIndex);
          const fnRegex = /(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^{;]+))?/g;
          let fnMatch;
          while ((fnMatch = fnRegex.exec(blockContent)) !== null) {
            const methodName = fnMatch[1];
            const paramsText = fnMatch[2];
            const returnType = fnMatch[3] ? fnMatch[3].trim() : 'void';

            const parameters = paramsText
              .split(',')
              .map(p => p.trim())
              .filter(p => p !== '' && p !== 'self' && p !== '&self' && p !== '&mut self')
              .map(p => {
                const parts = p.split(':');
                return {
                  name: parts[0] ? parts[0].trim() : 'param',
                  type: parts[1] ? parts[1].trim() : 'any'
                };
              });

            targetClass.methods.push({
              name: methodName,
              parameters,
              returnType,
              visibility: 'public'
            });
          }
        }
      }

      Object.values(fileClasses).forEach(c => {
        const structDefRegex = new RegExp(`struct\\s+${c.name}\\s*(?:<[^>]+>)?\\s*\\{([^}]+)\\}`, 'm');
        const structDefMatch = content.match(structDefRegex);
        if (structDefMatch) {
          const fieldsText = structDefMatch[1];
          const fieldRegex = /(?:pub(?:\([^)]+\))?\s+)?(\w+)\s*:\s*([^,\n]+)/g;
          let fieldMatch;
          while ((fieldMatch = fieldRegex.exec(fieldsText)) !== null) {
            const propName = fieldMatch[1];
            const propType = fieldMatch[2].trim();
            c.properties.push({
              name: propName,
              type: propType,
              visibility: 'public'
            });
            c.dependencies.push(propType.replace(/[&*\s]/g, '').replace(/<.*>/, ''));
          }
        }
        c.dependencies = Array.from(new Set(c.dependencies)).filter(d => d && d !== c.name && !['i32', 'u32', 'i64', 'u64', 'usize', 'str', 'String', 'bool', 'f32', 'f64', 'Option', 'Vec', 'Result'].includes(d));
        classes.push(c);
      });
    } else if (ext === '.go') {
      const typeRegex = /type\s+(\w+)\s+(struct|interface)/g;
      let match;
      const fileClasses: { [name: string]: ParsedClass } = {};

      while ((match = typeRegex.exec(content)) !== null) {
        const name = match[1];
        fileClasses[name] = {
          name,
          filePath: relativePath,
          properties: [],
          methods: [],
          implementsList: [],
          dependencies: []
        };
      }

      const funcRegex = /func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\(([^)]*)\)(?:\s*([^{\n]+))?/g;
      let funcMatch;
      while ((funcMatch = funcRegex.exec(content)) !== null) {
        const structName = funcMatch[1];
        const methodName = funcMatch[2];
        const paramsText = funcMatch[3];
        const returnType = funcMatch[4] ? funcMatch[4].trim() : 'void';

        let targetClass = fileClasses[structName];
        if (!targetClass) {
          targetClass = {
            name: structName,
            filePath: relativePath,
            properties: [],
            methods: [],
            implementsList: [],
            dependencies: []
          };
          fileClasses[structName] = targetClass;
        }

        const parameters = paramsText
          .split(',')
          .map(p => p.trim())
          .filter(p => p !== '')
          .map(p => {
            const parts = p.split(/\s+/);
            return {
              name: parts[0] || 'param',
              type: parts[1] || 'any'
            };
          });

        targetClass.methods.push({
          name: methodName,
          parameters,
          returnType,
          visibility: /^[A-Z]/.test(methodName) ? 'public' : 'private'
        });
      }

      Object.values(fileClasses).forEach(c => {
        const structDefRegex = new RegExp(`type\\s+${c.name}\\s+struct\\s*\\{([^}]+)\\}`, 'm');
        const structDefMatch = content.match(structDefRegex);
        if (structDefMatch) {
          const fieldsText = structDefMatch[1];
          const lines = fieldsText.split('\n');
          lines.forEach(line => {
            const fieldMatch = line.trim().match(/^(\w+)\s+([^\s`]+)/);
            if (fieldMatch) {
              const propName = fieldMatch[1];
              const propType = fieldMatch[2];
              c.properties.push({
                name: propName,
                type: propType,
                visibility: /^[A-Z]/.test(propName) ? 'public' : 'private'
              });
              c.dependencies.push(propType);
            }
          });
        }
        c.dependencies = Array.from(new Set(c.dependencies)).filter(d => d && d !== c.name && !['string', 'int', 'int64', 'bool', 'float64', 'error', 'interface{}'].includes(d));
        classes.push(c);
      });
    } else if (ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp' || ext === '.c') {
      const classRegex = /(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)?\s*(\w+))?/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        if (name === 'std' || name === 'string' || name === 'vector') continue;
        const baseClass = match[2];
        
        const fileClass: ParsedClass = {
          name,
          filePath: relativePath,
          baseClass,
          implementsList: [],
          properties: [],
          methods: [],
          dependencies: baseClass ? [baseClass] : []
        };

        const startIndex = match.index + match[0].length;
        let braceCount = 0;
        let endIndex = -1;
        for (let i = startIndex; i < content.length; i++) {
          if (content[i] === '{') braceCount++;
          else if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }

        if (endIndex !== -1) {
          const classBody = content.substring(startIndex, endIndex);
          const methodRegex = /(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:[;{]|=)/g;
          let methodMatch;
          while ((methodMatch = methodRegex.exec(classBody)) !== null) {
            const returnType = methodMatch[1];
            const methodName = methodMatch[2];
            const paramsText = methodMatch[3];
            
            if (methodName !== 'if' && methodName !== 'while' && methodName !== 'for' && methodName !== 'switch' && methodName !== 'return') {
              const parameters = paramsText
                .split(',')
                .map(p => p.trim())
                .filter(p => p !== '')
                .map(p => {
                  const parts = p.split(/\s+/);
                  return {
                    name: parts[parts.length - 1] || 'param',
                    type: parts.slice(0, -1).join(' ') || 'any'
                  };
                });

              fileClass.methods.push({
                name: methodName,
                parameters,
                returnType,
                visibility: 'public'
              });
            }
          }

          const propRegex = /(\w+(?:<[^>]+>)?)\s+(\w+)\s*;/g;
          let propMatch;
          while ((propMatch = propRegex.exec(classBody)) !== null) {
            const propType = propMatch[1];
            const propName = propMatch[2];
            if (propName !== 'return' && propName !== 'break' && propName !== 'continue') {
              fileClass.properties.push({
                name: propName,
                type: propType,
                visibility: 'public'
              });
              fileClass.dependencies.push(propType);
            }
          }
        }

        fileClass.dependencies = Array.from(new Set(fileClass.dependencies)).filter(d => d && d !== fileClass.name && !['int', 'float', 'double', 'char', 'bool', 'void', 'string', 'std'].includes(d));
        classes.push(fileClass);
      }
    } else if (ext === '.php') {
      const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        const baseClass = match[2];
        const implementsList = match[3] ? match[3].split(',').map(s => s.trim()) : [];
        
        const fileClass: ParsedClass = {
          name,
          filePath: relativePath,
          baseClass,
          implementsList,
          properties: [],
          methods: [],
          dependencies: baseClass ? [baseClass] : []
        };
        implementsList.forEach(i => fileClass.dependencies.push(i));

        const methodRegex = /(?:(public|protected|private)\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(content)) !== null) {
          const visibility = (methodMatch[1] || 'public') as 'public' | 'protected' | 'private';
          const methodName = methodMatch[2];
          const paramsText = methodMatch[3];
          
          const parameters = paramsText
            .split(',')
            .map(p => p.trim())
            .filter(p => p !== '')
            .map(p => {
              const parts = p.split(/\s+/);
              return {
                name: parts[parts.length - 1] || 'param',
                type: parts.length > 1 ? parts[0] : 'any'
              };
            });

          fileClass.methods.push({
            name: methodName,
            parameters,
            returnType: 'any',
            visibility
          });
        }

        const propRegex = /(public|protected|private)?\s+\$(\w+)\s*(?:;|=)/g;
        let propMatch;
        while ((propMatch = propRegex.exec(content)) !== null) {
          const visibility = (propMatch[1] || 'public') as 'public' | 'protected' | 'private';
          const propName = propMatch[2];
          fileClass.properties.push({
            name: propName,
            type: 'any',
            visibility
          });
        }

        fileClass.dependencies = Array.from(new Set(fileClass.dependencies)).filter(d => d && d !== fileClass.name);
        classes.push(fileClass);
      }
    }

    if (currentClass) {
      currentClass.dependencies = Array.from(dependencies).filter(d => d !== currentClass!.name);
      classes.push(currentClass);
    }

    if (classes.length === initialLen) {
      const fileName = path.basename(filePath);
      classes.push({
        name: fileName,
        filePath: relativePath,
        implementsList: [],
        properties: [],
        methods: [],
        dependencies: [],
        isModule: true
      });
    }
  } catch (error) {
    console.error(`Error parsing Regex file ${filePath}:`, error);
  }
}

function generateGraphLayout(classes: ParsedClass[]) {
  const classNames = new Set(classes.map(c => c.name));
  
  const levels: { [className: string]: number } = {};
  const graph: { [className: string]: string[] } = {};
  const inDegree: { [className: string]: number } = {};

  classes.forEach(c => {
    graph[c.name] = [];
    inDegree[c.name] = 0;
    levels[c.name] = 0;
  });

  classes.forEach(c => {
    const targets = new Set<string>();
    if (c.baseClass && classNames.has(c.baseClass)) {
      targets.add(c.baseClass);
    }
    c.implementsList.forEach(i => {
      if (classNames.has(i)) targets.add(i);
    });
    c.dependencies.forEach(d => {
      if (classNames.has(d)) targets.add(d);
    });

    targets.forEach(target => {
      graph[target].push(c.name);
      inDegree[c.name]++;
    });
  });

  const queue: string[] = [];
  classes.forEach(c => {
    if (inDegree[c.name] === 0) {
      queue.push(c.name);
      levels[c.name] = 0;
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const curLevel = levels[current];

    graph[current].forEach(neighbor => {
      levels[neighbor] = Math.max(levels[neighbor], curLevel + 1);
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0 || inDegree[neighbor] < 0) {
        queue.push(neighbor);
      }
    });
  }

  // Count nodes at each level
  const levelCounts: { [level: number]: number } = {};
  classes.forEach(c => {
    const lvl = levels[c.name] || 0;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
  });

  const levelIndices: { [level: number]: number } = {};

  const nodes = classes.map(c => {
    const level = levels[c.name] || 0;
    const index = levelIndices[level] || 0;
    levelIndices[level] = index + 1;

    // Centered layout: X flows left-to-right (depth levels), Y distributes vertically
    const x = level * 300 + 80;
    const totalLevelNodes = levelCounts[level] || 1;
    
    // Centering formula
    const y = (index - (totalLevelNodes - 1) / 2) * 110 + 350;

    return {
      id: c.name,
      type: 'customClass',
      position: { x, y },
      data: {
        name: c.name,
        filePath: c.filePath,
        baseClass: c.baseClass,
        implementsList: c.implementsList,
        propertiesCount: c.properties.length,
        methodsCount: c.methods.length,
        methods: c.methods,
        properties: c.properties,
        dependencies: c.dependencies,
        isModule: c.isModule
      }
    };
  });

  const edges: any[] = [];
  classes.forEach(c => {
    if (c.baseClass && classNames.has(c.baseClass)) {
      edges.push({
        id: `e-${c.name}-extends-${c.baseClass}`,
        source: c.baseClass,
        target: c.name,
        type: 'default', // Smooth curved bezier
        label: 'extends',
        animated: true,
        style: { stroke: '#FFB800', strokeWidth: 2 }
      });
    }

    c.implementsList.forEach(impl => {
      if (classNames.has(impl)) {
        edges.push({
          id: `e-${c.name}-implements-${impl}`,
          source: impl,
          target: c.name,
          type: 'default', // Smooth curved bezier
          label: 'implements',
          style: { stroke: '#00E0FF', strokeDasharray: '5,5', strokeWidth: 1.5 }
        });
      }
    });

    c.dependencies.forEach(dep => {
      if (classNames.has(dep) && dep !== c.baseClass && !c.implementsList.includes(dep)) {
        edges.push({
          id: `e-${c.name}-uses-${dep}`,
          source: dep,
          target: c.name,
          type: 'default', // Smooth curved bezier
          label: 'uses',
          style: { stroke: '#8F9CAE', strokeDasharray: '3,3', strokeWidth: 1 }
        });
      }
    });
  });

  return { nodes, edges };
}

function getVueScriptContent(content: string): string {
  const match = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  return match ? match[1] : '';
}

export function parseRepository(repoPath: string): ParseResult {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.vue', '.rs', '.go', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.c', '.php'];
  const files = getAllFiles(repoPath, extensions);
  const classes: ParsedClass[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      parseTypeScriptFile(filePath, relativePath, content, classes);
    } else if (ext === '.vue') {
      const scriptContent = getVueScriptContent(content);
      parseTypeScriptFile(filePath, relativePath, scriptContent || content, classes);
    } else {
      parseRegexFile(filePath, relativePath, content, ext, classes);
    }
  }

  const { nodes, edges } = generateGraphLayout(classes);

  return {
    classes,
    nodes,
    edges
  };
}
