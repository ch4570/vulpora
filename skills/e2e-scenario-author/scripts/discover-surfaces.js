#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const IGNORED_DIRS = new Set(['.git', '.gradle', '.next', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target', 'test-report']);
const SPRING_SOURCE_PATTERN = /\/src\/main\/(?:kotlin|java)\/.*\.(?:kt|java)$/;
const NODE_SOURCE_PATTERN = /\/src\/.*\.tsx?$/;
const SPRING_BUILD_NAMES = new Set(['build.gradle', 'build.gradle.kts', 'pom.xml', 'settings.gradle', 'settings.gradle.kts']);
const NODE_INPUT_NAMES = new Set(['package.json', 'pnpm-workspace.yaml', 'npm-workspaces.json']);
const CONSTRAINTS = new Map([
  ['NotBlank', 'NOT-BLANK'], ['NotNull', 'NOT-NULL'], ['Min', 'MIN'], ['Max', 'MAX'],
  ['Size', 'SIZE'], ['Pattern', 'PATTERN'], ['Positive', 'POSITIVE'], ['Negative', 'NEGATIVE'],
  ['IsDefined', 'DEFINED'], ['IsNotEmpty', 'NOT-EMPTY'], ['MinLength', 'MIN-LENGTH'],
  ['MaxLength', 'MAX-LENGTH'], ['Length', 'LENGTH'], ['Matches', 'PATTERN'], ['IsEmail', 'EMAIL'],
  ['IsUUID', 'UUID'],
]);

function fail(code, detail) {
  process.stderr.write(`${code}${detail ? `: ${detail}` : ''}\n`);
  process.exit(1);
}

function compareCodeUnits(left, right) {
  // Inventory order and fingerprints must not depend on host locale or ICU data.
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function walk(root) {
  const files = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, {withFileTypes: true})
      .sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) visit(absolute);
      } else if (entry.isFile()) files.push(absolute);
    }
  }
  visit(root);
  return files;
}

function relative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function springModuleName(root, sourcePath) {
  const rel = `/${relative(root, sourcePath)}`;
  const prefix = rel.split('/src/main/')[0];
  // Match the runner's root-module identity without depending on checkout names.
  return prefix ? prefix.split('/').filter(Boolean).join(':') : ':';
}

function nearestPackage(root, sourcePath) {
  let directory = path.dirname(sourcePath);
  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath) && fs.lstatSync(packagePath).isFile()) {
      let manifest;
      try { manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8')); } catch {
        fail('SCA-5.2', `${relative(root, packagePath)}: invalid package.json`);
      }
      const rawName = typeof manifest.name === 'string' ? manifest.name : path.basename(directory);
      const module = rawName.split('/').at(-1).replace(/^@/, '');
      if (!/^[A-Za-z0-9_.-]+$/.test(module)) fail('SCA-5.2', `${relative(root, packagePath)}: unstable package name`);
      return {directory, manifest, module, packagePath};
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  fail('SCA-5.2', `${relative(root, sourcePath)}: source is not owned by a package.json`);
}

function isNestManifest(manifest) {
  const dependencies = {...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies};
  return Boolean(dependencies['@nestjs/common'] && dependencies['@nestjs/core']);
}

function isNodeSource(file) {
  const normalized = `/${file.split(path.sep).join('/')}`;
  return NODE_SOURCE_PATTERN.test(normalized)
    && !/\.(?:spec|test)\.tsx?$/.test(normalized)
    && !/\.d\.ts$/.test(normalized);
}

function addResolved(map, key, value) {
  const values = map.get(key) || new Set();
  values.add(value);
  map.set(key, values);
}

function collectResolver(sourceFiles, configFiles) {
  const constants = new Map();
  const properties = new Map();
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const patterns = [
      /\bconst\s+val\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*String)?\s*=\s*"([^"]*)"/g,
      /\bstatic\s+final\s+String\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/g,
      /\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*string)?\s*=\s*["']([^"']*)["']/g,
      /\bstatic\s+(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*string)?\s*=\s*["']([^"']*)["']/g,
    ];
    for (const pattern of patterns) for (const match of content.matchAll(pattern)) {
      addResolved(constants, match[1], match[2]);
      const owners = [...content.slice(0, match.index).matchAll(/\b(?:object|class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g)];
      if (owners.length > 0) addResolved(constants, `${owners.at(-1)[1]}.${match[1]}`, match[2]);
    }
  }
  for (const file of configFiles) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (file.endsWith('.properties')) {
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*[=:]\s*(.*?)\s*$/);
        if (match && !match[1].startsWith('#')) addResolved(properties, match[1], match[2]);
      }
      continue;
    }
    const stack = [];
    for (const line of content.split('\n')) {
      if (/^\s*(?:#.*)?$/.test(line)) continue;
      const match = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/);
      if (!match) continue;
      const indent = match[1].replace(/\t/g, '  ').length;
      while (stack.length > 0 && stack.at(-1).indent >= indent) stack.pop();
      if (match[3] === '') {
        stack.push({indent, key: match[2]});
      } else {
        const key = [...stack.map((entry) => entry.key), match[2]].join('.');
        const value = match[3].replace(/\s+#.*$/, '').replace(/^(["'])(.*)\1$/, '$2');
        addResolved(properties, key, value);
      }
    }
  }
  return {constants, properties};
}

function uniqueResolved(map, key, sourceRef, kind) {
  const values = map.get(key);
  if (!values || values.size !== 1) {
    fail('SCA-5.2', `${sourceRef}: ${kind} ${key} resolves to ${values?.size ?? 0} values`);
  }
  return [...values][0];
}

function resolveStaticExpression(expression, resolver, sourceRef) {
  let unwrapped = expression.trim();
  if (unwrapped.startsWith('arrayOf(') && unwrapped.endsWith(')')) unwrapped = unwrapped.slice(8, -1);
  if ((unwrapped.startsWith('[') && unwrapped.endsWith(']'))
    || (unwrapped.startsWith('{') && unwrapped.endsWith('}'))) unwrapped = unwrapped.slice(1, -1);
  const items = unwrapped.split(/\s*,\s*/).filter(Boolean);
  const literals = items.map((item) => item.split(/\s*\+\s*/).map((part) => {
    const quoted = part.match(/^["']([^"']*)["']$/);
    if (quoted) return quoted[1];
    if (/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(part)) {
      return uniqueResolved(resolver.constants, part, sourceRef, 'constant');
    }
    fail('SCA-5.2', `${sourceRef}: unresolved annotation expression ${part}`);
  }).join(''));
  return literals.map((literal) => literal.replace(/\\?\$\{([^}]+)\}/g, (_match, key) => (
    uniqueResolved(resolver.properties, key, sourceRef, 'property')
  )));
}

function annotationLiterals(args, sourceRef, names, allowImplicitEmpty, resolver) {
  if (args === undefined || args.trim() === '') {
    if (allowImplicitEmpty) return [''];
    fail('SCA-5.2', `${sourceRef}: required annotation value is absent`);
  }
  const namePattern = names.join('|');
  const named = args.match(new RegExp(`(?:^|,)\\s*(?:${namePattern})\\s*=\\s*(\\[[^\\]]*\\]|\\{[^}]*\\}|arrayOf\\([^)]*\\)|"[^"]*"|'[^']*'|[^,]+)`));
  let expression = named?.[1];
  if (!expression) {
    if (/^\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*=/.test(args)) {
      if (allowImplicitEmpty) return [''];
      fail('SCA-5.2', `${sourceRef}: required annotation value is absent`);
    }
    expression = args.match(/^\s*(\[[^\]]*\]|\{[^}]*\}|arrayOf\([^)]*\)|"[^"]*"|'[^']*'|[^,]+)/)?.[1];
  }
  if (!expression) fail('SCA-5.2', `${sourceRef}: mapping has no static literal`);
  const literals = resolveStaticExpression(expression, resolver, sourceRef);
  if (literals.length === 0) fail('SCA-5.2', `${sourceRef}: mapping has no static literal`);
  return literals;
}

function collectComposedMappings(sourceFiles, root, resolver) {
  const composed = new Map();
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const declaration of content.matchAll(/(?:\bannotation\s+class|@interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const prefixStart = Math.max(0, declaration.index - 1200);
      const prefix = content.slice(prefixStart, declaration.index);
      const mappings = [...prefix.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping(?:\s*\(([^)]*)\))?/g)];
      if (mappings.length === 0) continue;
      const mapping = mappings.at(-1);
      const between = prefix.slice(mapping.index + mapping[0].length);
      if (/\b(?:class|interface|fun|void|String|Int|Long|Boolean)\b/.test(between)) continue;
      const sourceRef = `${relative(root, file)}:${lineOf(content, prefixStart + mapping.index)}`;
      const paths = annotationLiterals(mapping[2], sourceRef, ['value', 'path'], true, resolver);
      if (composed.has(declaration[1])) fail('SCA-5.2', `${sourceRef}: duplicate composed mapping ${declaration[1]}`);
      composed.set(declaration[1], {method: mapping[1].toUpperCase(), paths, source: sourceRef});
    }
  }
  return composed;
}

function collectAuthAnnotations(sourceFiles) {
  const names = new Set();
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const declaration of content.matchAll(/(?:\bannotation\s+class|@interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const prefix = content.slice(Math.max(0, declaration.index - 1200), declaration.index);
      const matches = [...prefix.matchAll(/@(PreAuthorize|Secured)\b/g)];
      if (matches.length === 0) continue;
      const auth = matches.at(-1);
      const between = prefix.slice(auth.index + auth[0].length);
      if (!/\b(?:class|interface|fun|void)\b/.test(between)) names.add(declaration[1]);
    }
  }
  return names;
}

function hasLocalAuth(value, authAnnotations) {
  if (/@(?:PreAuthorize|Secured)\b/.test(value)) return true;
  return [...authAnnotations].some((name) => new RegExp(`@${name}\\b`).test(value));
}

function joinRoute(base, leaf) {
  const joined = `/${[base, leaf].join('/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')}`;
  return joined === '/' ? '/' : joined.replace(/\/$/, '');
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function behaviorToken(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
}

function validationBehaviors(window) {
  const found = new Set();
  const kotlin = /@(?:field:)?(NotBlank|NotNull|Min|Max|Size|Pattern|Positive|Negative)(?:\([^)]*\))?\s+(?:(?:@\w+(?:\([^)]*\))?\s+)*)(?:val\s+|var\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  const java = /@(?:field:)?(NotBlank|NotNull|Min|Max|Size|Pattern|Positive|Negative)(?:\([^)]*\))?\s+(?:(?:@\w+(?:\([^)]*\))?\s+)*)(?:[A-Za-z_$][A-Za-z0-9_$<>?,.\[\]]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*[,);]/g;
  for (const pattern of [kotlin, java]) {
    for (const match of window.matchAll(pattern)) {
      found.add(`VALIDATION-FAIL-${behaviorToken(match[2])}-${CONSTRAINTS.get(match[1])}`);
    }
  }
  const typescriptProperty = /((?:\s*@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)+)([A-Za-z_][A-Za-z0-9_]*)[!?]?\s*:/g;
  for (const property of window.matchAll(typescriptProperty)) {
    for (const decorator of property[1].matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const constraint = CONSTRAINTS.get(decorator[1]);
      if (constraint) found.add(`VALIDATION-FAIL-${behaviorToken(property[2])}-${constraint}`);
    }
  }
  return [...found].sort();
}

function balancedBody(content, openIndex, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === quote && content[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth === 0) return content.slice(openIndex + 1, index);
  }
  return null;
}

function maskSourceTrivia(content, strings = false) {
  // Preserve offsets/newlines; imports need string literals, declaration nesting does not.
  return content.replace(/("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, quoted) => quoted && !strings ? quoted : match.replace(/[^\n]/g, ' '));
}

function collectTypeConstraints(sourceFiles, root, profile) {
  const types = new Map();
  const sources = new Map();
  for (const file of sourceFiles) {
    const content = maskSourceTrivia(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    const source = relative(root, file);
    const syntax = maskSourceTrivia(content, true);
    const packageName = syntax.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)/m)?.[1] || '';
    const module = profile === 'spring-jvm' ? springModuleName(root, file) : nearestPackage(root, file).directory;
    sources.set(source, {content, syntax, packageName, module});
    let scanned = 0;
    let depth = 0;
    for (const match of syntax.matchAll(/\b(?:(?:data\s+)?class|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      for (; scanned < match.index; scanned += 1) {
        if (syntax[scanned] === '{') depth += 1;
        if (syntax[scanned] === '}') depth -= 1;
      }
      if (depth !== 0) continue; // Nested types are not top-level package/FQN candidates.
      const tail = content.slice(match.index + match[0].length);
      const opening = tail.match(/^\s*([({])/);
      let validationBody = '';
      let unsupported = false;
      if (!opening) {
        // Do not scan forward into the next type/function's body for a bodyless class.
        unsupported = !file.endsWith('.kt')
          || !/^\s*(?:$|(?:class|data\s+class|object|interface|fun|val|var)\b)/.test(tail);
      } else {
        const open = opening[1];
        const openIndex = match.index + match[0].length + opening[0].length - 1;
        const body = balancedBody(content, openIndex, open, open === '(' ? ')' : '}');
        if (body === null) fail('SCA-5.2', `${source}:${lineOf(content, openIndex)}: unbalanced type declaration`);
        // Include the closing delimiter: Java record's last component has no comma.
        validationBody = body + (open === '(' ? ')' : '}');
        const after = content.slice(openIndex + body.length + 2);
        if (open === '(' && /^\s*\{/.test(after)) {
          const bodyIndex = openIndex + body.length + 2 + after.indexOf('{');
          const classBody = balancedBody(content, bodyIndex, '{', '}');
          if (classBody === null) fail('SCA-5.2', `${source}:${lineOf(content, bodyIndex)}: unbalanced type body`);
          validationBody += classBody;
        }
        unsupported = (open === '(' && /^\s*(?::|extends\b|implements\b)/.test(after))
          || /\b(?:class|record|interface)\s|@Valid\b|@ValidateNested\b/.test(maskSourceTrivia(validationBody, true));
      }
      const behaviors = validationBehaviors(maskSourceTrivia(validationBody, true));
      const entries = types.get(match[1]) || [];
      entries.push({behaviors, source, module, unsupported,
        qualifiedName: packageName ? `${packageName}.${match[1]}` : match[1],
        exported: /\bexport\s+(?:abstract\s+)?$/.test(content.slice(0, match.index)),
      });
      types.set(match[1], entries);
    }
  }
  return {types, sources};
}

function resolvedRequestBehaviors(typeName, typeConstraints, sourceRef, sourceLine, nest = false) {
  const reject = (reason) => fail('SCA-5.2', `${sourceRef}:${sourceLine}: request type ${typeName}: ${reason}`);
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(typeName)) reject('only simple, non-generic request types are supported');
  const owner = typeConstraints.sources.get(sourceRef);
  let candidates = typeConstraints.types.get(typeName) || [];
  if (nest) {
    const imports = [];
    for (const match of owner.content.matchAll(/^\s*import\s+([^;]+?)\s+from\s*['"]([^'"]+)['"]/gm)) {
      const tokenIndex = match.index + match[0].indexOf('import');
      if (owner.syntax.slice(tokenIndex, tokenIndex + 6) !== 'import') continue;
      const clause = match[1].trim();
      const named = clause.match(/^\{([\s\S]*)\}$/);
      if (named) {
        for (const binding of named[1].split(',').map(value => value.trim())) {
          if (binding === typeName) imports.push(match[2]);
          else if (new RegExp(`\\bas\\s+${typeName}$`).test(binding)) reject('aliased imports are unsupported');
        }
      } else if (new RegExp(`\\b${typeName}\\b`).test(clause)) reject('only direct relative named imports are supported');
    }
    const local = candidates.filter(entry => entry.source === sourceRef);
    if (local.length > 0) {
      if (imports.length > 0) reject('local declaration conflicts with an import');
      candidates = local;
    } else {
      if (imports.length !== 1 || !/^\.\.?\//.test(imports[0])) reject('requires one direct relative named import');
      const imported = path.posix.normalize(path.posix.join(path.posix.dirname(sourceRef), imports[0]));
      const paths = /\.tsx?$/.test(imported) ? [imported] : [`${imported}.ts`, `${imported}.tsx`];
      const files = paths.filter(value => typeConstraints.sources.has(value));
      if (files.length !== 1) reject('import does not resolve to one discovered source file');
      candidates = candidates.filter(entry => entry.source === files[0] && entry.exported);
    }
  } else {
    const imports = [];
    for (const match of owner.content.matchAll(/^\s*import\s+([^;\n]+)/gm)) {
      const tokenIndex = match.index + match[0].indexOf('import');
      if (owner.syntax.slice(tokenIndex, tokenIndex + 6) !== 'import') continue;
      const imported = match[1].trim();
      if (new RegExp(`\\bas\\s+${typeName}$`).test(imported)) reject('aliased imports are unsupported');
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(imported) && imported.split('.').at(-1) === typeName) imports.push(imported);
    }
    if (imports.length > 1) reject('multiple explicit imports');
    const qualifiedName = imports[0] || (owner.packageName ? `${owner.packageName}.${typeName}` : typeName);
    candidates = candidates.filter(entry => entry.qualifiedName === qualifiedName);
    // Even a local candidate cannot select among identical FQNs in other modules
    // without the build graph. Never fall back to an unrelated simple-name DTO.
    if (candidates.length > 1) reject('qualified name has multiple declarations');
    if (imports.length === 0) candidates = candidates.filter(entry => entry.module === owner.module);
  }
  if (candidates.length !== 1) reject(`resolves to ${candidates.length} declarations`);
  if (candidates[0].unsupported) reject('inherited, generic, or nested validation requires unsupported type resolution');
  return candidates[0].behaviors;
}

function validatedRequestBehaviors(window, typeConstraints, sourceRef, sourceLine) {
  window = maskSourceTrivia(window, true);
  if (!/@Valid\b/.test(window)) return [];
  const typeNames = [];
  for (const match of window.matchAll(/@Valid\b(?:\s+@\w+(?:\([^)]*\))?)*\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^\s,)]+)/g)) {
    typeNames.push(match[1]);
  }
  for (const match of window.matchAll(/@Valid\b(?:\s+@\w+(?:\([^)]*\))?)*\s+([^\s,:()]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*[,)]/g)) {
    typeNames.push(match[1]);
  }
  if (typeNames.length !== [...window.matchAll(/@Valid\b/g)].length) fail('SCA-5.2', `${sourceRef}:${sourceLine}: unresolved @Valid request type`);
  const result = new Set();
  for (const typeName of typeNames) {
    for (const behavior of resolvedRequestBehaviors(typeName, typeConstraints, sourceRef, sourceLine)) result.add(behavior);
  }
  return [...result].sort();
}

function validatedNestRequestBehaviors(window, typeConstraints, sourceRef, sourceLine, validationEnabled) {
  window = maskSourceTrivia(window, true);
  if (!validationEnabled && !/@UsePipes\s*\([^)]*ValidationPipe/.test(window)) return [];
  const typeNames = [];
  for (const match of window.matchAll(/@Body(?:\s*\([^)]*\))?\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^\s,)]+)/g)) {
    typeNames.push(match[1]);
  }
  if (typeNames.length !== [...window.matchAll(/@Body\b/g)].length) fail('SCA-5.2', `${sourceRef}:${sourceLine}: unresolved @Body request type`);
  const result = new Set();
  for (const typeName of typeNames) {
    for (const behavior of resolvedRequestBehaviors(typeName, typeConstraints, sourceRef, sourceLine, true)) result.add(behavior);
  }
  return [...result].sort();
}

function precedingAnnotationBlock(content, index) {
  const lines = content.slice(0, index).split('\n');
  const collected = [];
  while (lines.length > 0) {
    const line = lines.pop();
    if (line.trim() === '' && collected.length === 0) continue;
    if (!/^\s*@/.test(line)) break;
    collected.unshift(line);
  }
  return collected.join('\n');
}

function springHandlerParameters(content, start, end, sourceRef, sourceLine) {
  const reject = () => fail('SCA-5.2', `${sourceRef}:${sourceLine}: cannot prove handler parameter boundaries`);
  // Work in an offset-preserving lexical view, returning the original parameter
  // text. Annotation strings/comments must not supply or terminate parentheses.
  const window = content.slice(start, end);
  const syntax = maskSourceTrivia(window, true);
  function skipSpace(index) {
    while (index < syntax.length && /\s/.test(syntax[index])) index += 1;
    return index;
  }
  function closingParenthesis(open) {
    let depth = 0;
    for (let index = open; index < syntax.length; index += 1) {
      if (syntax[index] === '(') depth += 1;
      if (syntax[index] === ')' && --depth === 0) return index;
    }
    reject();
  }
  function afterAnnotation(startIndex) {
    const name = syntax.slice(startIndex).match(/^@[A-Za-z_$][A-Za-z0-9_$.]*/);
    if (!name) reject();
    const index = skipSpace(startIndex + name[0].length);
    return syntax[index] === '(' ? closingParenthesis(index) + 1 : index;
  }

  let index = skipSpace(0);
  while (syntax[index] === '@') index = skipSpace(afterAnnotation(index));
  const open = syntax.indexOf('(', index);
  if (open < 0) reject();
  const head = syntax.slice(index, open).trim();
  if (sourceRef.endsWith('.kt')) {
    // Receiver/generic function declarations need additional type resolution;
    // do not search forward into their bodies for something resembling a method.
    const modifiers = '(?:(?:public|private|protected|internal|open|final|override|suspend|inline|tailrec|operator|infix|external|actual|expect)\\s+)*';
    if (!new RegExp(`^${modifiers}fun\\s+[A-Za-z_][A-Za-z0-9_]*$`).test(head)) reject();
  } else if (sourceRef.endsWith('.java')) {
    const declaration = head.replace(/^(?:(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default)\s+)*/, '');
    // Ordinary/qualified/generic/array return types, followed by one method name.
    // In particular, assignments and intervening field/class declarations fail.
    const returnType = '[A-Za-z_$][A-Za-z0-9_$.]*(?:\\s*<[A-Za-z0-9_$.,?<>\\[\\]\\s]+>)?(?:\\s*\\[\\s*\\])*';
    if (!new RegExp(`^${returnType}\\s+[A-Za-z_$][A-Za-z0-9_$]*$`).test(declaration)
      || /\b(?:class|interface|record|return|new|throw)\b/.test(declaration)) reject();
  } else reject();

  const close = closingParenthesis(open);
  // Annotation arrays may contain braces, but executable default-argument bodies
  // cannot be treated as direct parameter constraints. Leave these unsupported.
  for (let cursor = open + 1; cursor < close;) {
    if (syntax[cursor] === '@') cursor = afterAnnotation(cursor);
    else {
      if (syntax[cursor] === '{' || syntax[cursor] === '}') reject();
      cursor += 1;
    }
  }
  // The return type, throws clause and block/expression body are outside this
  // proven list. Keep ')' so the last Java parameter retains its delimiter.
  return window.slice(open, close + 1);
}

function discoverHttp(content, sourceRef, module, surfaces, typeConstraints, resolver, composedMappings, authAnnotations) {
  if (!/@(?:RestController|Controller)\b/.test(content)) return;
  const controllerCount = [...content.matchAll(/@(?:RestController|Controller)\b/g)].length;
  if (controllerCount !== 1) fail('SCA-5.2', `${sourceRef}: multiple controllers in one source file`);
  const classIndex = content.search(/\b(?:class|interface)\s+[A-Za-z_][A-Za-z0-9_]*/);
  const classPrefix = classIndex >= 0 ? content.slice(0, classIndex) : '';
  const classMappings = [...classPrefix.matchAll(/@RequestMapping(?:\s*\(([^)]*)\))?/g)];
  const basePaths = classMappings.length
    ? annotationLiterals(classMappings.at(-1)[1], `${sourceRef}:${lineOf(content, classMappings.at(-1).index)}`, ['value', 'path'], true, resolver)
    : [''];
  const classAuth = hasLocalAuth(classPrefix, authAnnotations);
  const mappingPattern = /@(Get|Post|Put|Delete|Patch)Mapping(?:\s*\(([^)]*)\))?/g;
  const mappings = [...content.matchAll(mappingPattern)].map((match) => ({
    index: match.index, method: match[1].toUpperCase(), args: match[2], fixedPaths: null,
  }));
  for (const [name, definition] of composedMappings) {
    const usagePattern = new RegExp(`@${name}(?:\\s*\\(([^)]*)\\))?`, 'g');
    for (const match of content.matchAll(usagePattern)) {
      if (match[1]?.trim()) {
        fail('SCA-5.2', `${sourceRef}:${lineOf(content, match.index)}: parameterized composed mapping ${name}`);
      }
      mappings.push({index: match.index, method: definition.method, args: undefined, fixedPaths: definition.paths});
    }
  }
  mappings.sort((left, right) => left.index - right.index);
  if (mappings.some((mapping) => mapping.index < classIndex)) {
    const mapping = mappings.find((candidate) => candidate.index < classIndex);
    fail('SCA-5.2', `${sourceRef}:${lineOf(content, mapping.index)}: method mapping applied before controller declaration`);
  }
  const requestMappings = [...content.matchAll(/@RequestMapping(?:\s*\(([^)]*)\))?/g)];
  if (requestMappings.some((mapping) => mapping.index > classIndex)) {
    const mapping = requestMappings.find((candidate) => candidate.index > classIndex);
    fail('SCA-5.2', `${sourceRef}:${lineOf(content, mapping.index)}: method-level @RequestMapping requires explicit HTTP method resolution`);
  }
  for (let index = 0; index < mappings.length; index += 1) {
    const match = mappings[index];
    const method = match.method;
    const sourceLine = lineOf(content, match.index);
    const leafPaths = match.fixedPaths
      || annotationLiterals(match.args, `${sourceRef}:${sourceLine}`, ['value', 'path'], true, resolver);
    const parameters = springHandlerParameters(content, match.index,
      mappings[index + 1]?.index ?? content.length, sourceRef, sourceLine);
    const methodAnnotations = precedingAnnotationBlock(content, match.index);
    const directValidation = validationBehaviors(maskSourceTrivia(parameters, true));
    const requestValidation = validatedRequestBehaviors(parameters, typeConstraints, sourceRef, sourceLine);
    const behaviors = new Set(['HAPPY', ...directValidation, ...requestValidation]);
    if (classAuth || hasLocalAuth(methodAnnotations, authAnnotations)) behaviors.add('AUTH-FAIL');
    for (const base of basePaths) for (const leaf of leafPaths) {
      const route = joinRoute(base, leaf);
      const target = `${method} ${route} (${module})`;
      surfaces.push({
        key: `http:${method}:${route}:${module}`,
        type: 'http', target, module, method, path: route,
        required_behaviors: [...behaviors].sort(), source: `${sourceRef}:${sourceLine}`,
      });
    }
  }
  if (/@(?:RestController|Controller)\b/.test(content) && mappings.length === 0) {
    fail('SCA-5.2', `${sourceRef}: controller has no directly discoverable method mapping`);
  }
}

function discoverKafka(content, sourceRef, module, surfaces, resolver) {
  for (const match of content.matchAll(/@KafkaListener\s*\(([^)]*)\)/g)) {
    const sourceLine = lineOf(content, match.index);
    const topics = annotationLiterals(match[1], `${sourceRef}:${sourceLine}`, ['topics', 'topicPattern'], false, resolver);
    const window = content.slice(Math.max(0, match.index - 500), Math.min(content.length, match.index + 1400));
    const behaviors = ['CONSUME'];
    if (/@RetryableTopic\b|errorHandler\s*=/.test(window)) behaviors.push('DLQ');
    for (const topic of topics) {
      const target = `KAFKA ${topic} (${module})`;
      surfaces.push({
        key: `kafka:${topic}:${module}`, type: 'kafka', target, module, topic,
        required_behaviors: behaviors.sort(), source: `${sourceRef}:${sourceLine}`,
      });
    }
  }
}

function discoverOutbox(content, sourceRef, module, surfaces) {
  for (const match of content.matchAll(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const tail = content.slice(match.index, match.index + 600);
    const braceOffset = tail.indexOf('{');
    if (braceOffset < 0) continue;
    const braceIndex = match.index + braceOffset;
    const body = balancedBody(content, braceIndex, '{', '}');
    if (body === null) fail('SCA-5.2', `${sourceRef}:${lineOf(content, braceIndex)}: unbalanced outbox owner`);
    const header = content.slice(match.index, braceIndex);
    const segment = `${header}\n${body}`;
    const isHandler = /OutboxEventHandler\s*</.test(header);
    const publishes = /OutboxEvent(?:Publisher|Saver)|outboxRepository/.test(segment);
    if (!isHandler && !publishes) continue;
    const owner = match[1];
    const behaviors = [];
    if (isHandler) behaviors.push('CONSUME');
    if (publishes) behaviors.push('PUBLISH');
    surfaces.push({
      key: `outbox:${owner}:${module}`, type: 'outbox', target: `OUTBOX ${owner} (${module})`, module,
      owner, required_behaviors: behaviors.sort(), source: `${sourceRef}:${lineOf(content, match.index)}`,
    });
  }
}

function collectNestSettings(sourceFiles, root, resolver) {
  const settings = new Map();
  for (const file of sourceFiles) {
    const owner = nearestPackage(root, file);
    const current = settings.get(owner.module) || {prefixes: new Set(), validationEnabled: false};
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const match of content.matchAll(/\.setGlobalPrefix\s*\(([^)]*)\)/g)) {
      const sourceRef = `${relative(root, file)}:${lineOf(content, match.index)}`;
      const values = resolveStaticExpression(match[1], resolver, sourceRef);
      if (values.length !== 1) fail('SCA-5.2', `${sourceRef}: setGlobalPrefix must resolve to one value`);
      current.prefixes.add(values[0]);
    }
    if (/\.useGlobalPipes\s*\([\s\S]{0,300}?\bValidationPipe\b/.test(content)) {
      current.validationEnabled = true;
    }
    settings.set(owner.module, current);
  }
  for (const [module, current] of settings) {
    if (current.prefixes.size > 1) fail('SCA-5.2', `${module}: global prefix resolves to multiple values`);
    current.prefix = current.prefixes.size === 1 ? [...current.prefixes][0] : '';
  }
  return settings;
}

function collectNestAuthDecorators(sourceFiles) {
  const names = new Set();
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const match of content.matchAll(/(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
      const window = content.slice(match.index, Math.min(content.length, match.index + 1200));
      if (/\bUseGuards\s*\(/.test(window)) names.add(match[1]);
    }
  }
  return names;
}

function hasNestLocalAuth(value, authDecorators) {
  if (/@UseGuards\b/.test(value)) return true;
  return [...authDecorators].some((name) => new RegExp(`@${name}\\b`).test(value));
}

function discoverNestHttp(content, sourceRef, module, surfaces, typeConstraints, resolver, settings, authDecorators) {
  const controllerMatches = [...content.matchAll(/@Controller(?:\s*\(([^)]*)\))?/g)];
  if (controllerMatches.length === 0) return;
  if (controllerMatches.length !== 1) fail('SCA-5.2', `${sourceRef}: multiple controllers in one source file`);
  const controller = controllerMatches[0];
  const classIndex = content.slice(controller.index).search(/\bclass\s+[A-Za-z_][A-Za-z0-9_]*/);
  if (classIndex < 0) fail('SCA-5.2', `${sourceRef}:${lineOf(content, controller.index)}: controller class is missing`);
  const absoluteClassIndex = controller.index + classIndex;
  const basePaths = annotationLiterals(
    controller[1], `${sourceRef}:${lineOf(content, controller.index)}`, ['path'], true, resolver,
  );
  const classAnnotations = content.slice(controller.index, absoluteClassIndex);
  const classAuth = hasNestLocalAuth(classAnnotations, authDecorators);
  const mappings = [...content.matchAll(/@(Get|Post|Put|Delete|Patch)(?:\s*\(([^)]*)\))?/g)]
    .filter((match) => match.index > absoluteClassIndex)
    .map((match) => ({index: match.index, method: match[1].toUpperCase(), args: match[2]}));
  if (mappings.length === 0) fail('SCA-5.2', `${sourceRef}: controller has no directly discoverable method mapping`);
  const moduleSettings = settings.get(module) || {prefix: '', validationEnabled: false};
  for (let index = 0; index < mappings.length; index += 1) {
    const match = mappings[index];
    const sourceLine = lineOf(content, match.index);
    const leafPaths = annotationLiterals(match.args, `${sourceRef}:${sourceLine}`, ['path'], true, resolver);
    const methodWindow = content.slice(match.index, mappings[index + 1]?.index ?? content.length);
    const requestValidation = validatedNestRequestBehaviors(
      methodWindow, typeConstraints, sourceRef, sourceLine, moduleSettings.validationEnabled,
    );
    const behaviors = new Set(['HAPPY', ...requestValidation]);
    if (classAuth || hasNestLocalAuth(methodWindow, authDecorators)) behaviors.add('AUTH-FAIL');
    for (const base of basePaths) for (const leaf of leafPaths) {
      const controllerRoute = joinRoute(base, leaf);
      const route = joinRoute(moduleSettings.prefix, controllerRoute);
      const target = `${match.method} ${route} (${module})`;
      surfaces.push({
        key: `http:${match.method}:${route}:${module}`,
        type: 'http', target, module, method: match.method, path: route,
        required_behaviors: [...behaviors].sort(), source: `${sourceRef}:${sourceLine}`,
      });
    }
  }
}

const [rootArg, contractArg] = process.argv.slice(2);
if (!rootArg || !contractArg || process.argv.length !== 4) fail('USAGE', 'discover-surfaces.js ROOT CONTRACT');
let root;
let contract;
try { root = fs.realpathSync.native(rootArg); } catch { fail('ROOT_UNREADABLE'); }
try {
  const stat = fs.lstatSync(contractArg);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('CONTRACT_UNREADABLE');
  contract = fs.readFileSync(contractArg, 'utf8').replace(/\r\n/g, '\n');
} catch { fail('CONTRACT_UNREADABLE'); }

const allFiles = walk(root);
const springBuildFiles = allFiles.filter((file) => SPRING_BUILD_NAMES.has(path.basename(file)));
const springBuildText = springBuildFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const packageFiles = allFiles.filter((file) => path.basename(file) === 'package.json');
const nestPackages = packageFiles.map((packagePath) => {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8')); } catch {
    fail('SCA-5.2', `${relative(root, packagePath)}: invalid package.json`);
  }
  return {directory: path.dirname(packagePath), manifest, packagePath};
}).filter(({manifest}) => isNestManifest(manifest));

let profile;
let sourceFiles;
let configFiles;
let buildFiles;
if (/(?:org\.springframework|spring-boot|spring-web|spring-kafka)/i.test(springBuildText)) {
  profile = 'spring-jvm';
  sourceFiles = allFiles.filter((file) => SPRING_SOURCE_PATTERN.test(`/${relative(root, file)}`));
  if (sourceFiles.length === 0) fail('SCA-5.0', 'no Spring-JVM source roots');
  configFiles = allFiles.filter((file) => /\/src\/main\/resources\/application[^/]*\.(?:yml|yaml|properties)$/.test(`/${relative(root, file)}`));
  buildFiles = springBuildFiles;
} else if (nestPackages.length > 0) {
  profile = 'node-nestjs';
  sourceFiles = allFiles.filter((file) => isNodeSource(file) && nestPackages.some(({directory}) => (
    file.startsWith(`${directory}${path.sep}`)
  )));
  if (sourceFiles.length === 0) fail('SCA-5.0', 'no NestJS TypeScript source roots');
  configFiles = allFiles.filter((file) => nestPackages.some(({directory}) => (
    path.dirname(file) === directory && /^(?:\.env\.example|nest-cli\.json|tsconfig(?:\.build)?\.json)$/.test(path.basename(file))
  )));
  buildFiles = allFiles.filter((file) => NODE_INPUT_NAMES.has(path.basename(file)))
    .filter((file) => path.basename(file) !== 'package.json' || file === path.join(root, 'package.json')
      || nestPackages.some(({packagePath}) => file === packagePath));
} else {
  fail('SCA-5.0', 'unsupported repository profile');
}

const typeConstraints = collectTypeConstraints(sourceFiles, root, profile);
const resolver = collectResolver(sourceFiles, configFiles);
const composedMappings = profile === 'spring-jvm' ? collectComposedMappings(sourceFiles, root, resolver) : new Map();
const authAnnotations = profile === 'spring-jvm' ? collectAuthAnnotations(sourceFiles) : new Set();
const nestSettings = profile === 'node-nestjs' ? collectNestSettings(sourceFiles, root, resolver) : new Map();
const nestAuthDecorators = profile === 'node-nestjs' ? collectNestAuthDecorators(sourceFiles) : new Set();
const inputs = [...new Set([...buildFiles, ...sourceFiles, ...configFiles])]
  .sort((left, right) => compareCodeUnits(relative(root, left), relative(root, right)));
const fingerprint = crypto.createHash('sha256');
fingerprint.update(`${profile}\0`);
fingerprint.update('docs/e2e-scenarios/CONTRACT.md\0');
fingerprint.update(contract);
fingerprint.update('\0');
const surfaces = [];
for (const file of inputs) {
  const rel = relative(root, file);
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  fingerprint.update(rel); fingerprint.update('\0'); fingerprint.update(content); fingerprint.update('\0');
  const isSource = profile === 'spring-jvm' ? SPRING_SOURCE_PATTERN.test(`/${rel}`) : isNodeSource(file);
  if (!isSource) continue;
  const module = profile === 'spring-jvm' ? springModuleName(root, file) : nearestPackage(root, file).module;
  if (profile === 'spring-jvm') {
    discoverHttp(content, rel, module, surfaces, typeConstraints, resolver, composedMappings, authAnnotations);
    discoverKafka(content, rel, module, surfaces, resolver);
    discoverOutbox(content, rel, module, surfaces);
  } else {
    discoverNestHttp(content, rel, module, surfaces, typeConstraints, resolver, nestSettings, nestAuthDecorators);
  }
}
surfaces.sort((left, right) => compareCodeUnits(left.key, right.key));
for (let index = 1; index < surfaces.length; index += 1) {
  if (surfaces[index - 1].key === surfaces[index].key) {
    fail('SCA-6.2', `${surfaces[index - 1].source}, ${surfaces[index].source}`);
  }
}
if (surfaces.length === 0) fail('SCA-5.0', 'supported profile has no discoverable E2E surfaces');
const result = {
  schema: 'vulpora.e2e-surface-inventory/v1',
  profile,
  source_fingerprint: fingerprint.digest('hex'),
  inputs: inputs.map((file) => relative(root, file)),
  surfaces,
};
process.stdout.write(`${canonicalJson(result)}\n`);
