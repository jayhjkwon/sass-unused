"use strict";

const fs = require("fs");

const postCssScss = require("postcss-scss");

function visitInterpolations(expression, callback) {
  let pos = 0;
  while ((pos = expression.indexOf("#{", pos)) !== -1) {
    // Find matching `}`.
    let braceLevel = 0;
    let end = pos;
    for (; end < expression.length; end++) {
      if (expression[end] === "{") {
        ++braceLevel;
      } else if (expression[end] === "}") {
        --braceLevel;
        if (braceLevel <= 0) {
          break;
        }
      }
    }

    // Pass interpolated expression to callback.
    callback(expression.slice(pos + 2, end));

    pos = end + 1;
  }
}

function visitSassExpressions(rootNode, callback) {
  rootNode.walk((node) => {
    switch (node.type) {
      case "decl":
        callback(node.value);
        visitInterpolations(node.prop, callback);
        break;
      case "rule":
        visitInterpolations(node.selector, callback);
        break;
      case "atrule":
        visitInterpolations(node.name, callback);
        if (node.name !== "mixin" && node.name !== "function") {
          callback(node.params);
        }
        break;
    }
  });
}

// Matches a possible mixin name or reference, which may include a module name
// (eg. "some-mixin" or "amodule.some-mixin").
const IDENTIFIER_REGEX = /[a-zA-Z0-9_.-]+/;

function gatherDeclaredVars(rootNode, path) {
  const vars = [];
  rootNode.walkDecls((decl) => {
    if (!decl.prop.startsWith("$")) {
      return;
    }
    // console.log("****", decl);
    vars.push({ id: decl.prop, path });
  });
  return vars;
}

function gatherUsedVars(rootNode, path) {
  const used = [];
  visitSassExpressions(rootNode, (expr) => {
    const idents = expr.match(/\$[a-zA-Z-_0-9]+/g);
    if (idents) {
      idents.forEach((id) => used.push({ id, path }));
    }
  });
  return used;
}

function gatherDeclaredMixins(rootNode, path) {
  const idents = [];
  rootNode.walkAtRules("mixin", (rule) => {
    const nameMatch = rule.params.match(IDENTIFIER_REGEX);
    if (!nameMatch) {
      throw new Error("Found mixin with no identifier");
    }
    idents.push({ id: nameMatch[0], path });
  });
  return idents;
}

function gatherUsedMixins(rootNode, path) {
  const idents = [];
  rootNode.walkAtRules("include", (rule) => {
    const nameMatch = rule.params.match(IDENTIFIER_REGEX);
    if (!nameMatch) {
      throw new Error("Found @include with no mixin name");
    }
    const parts = nameMatch[0].split(".");
    const ident = parts[parts.length - 1];
    idents.push({ id: ident, path });
  });
  return idents;
}

function gatherDeclaredFunctions(rootNode, path) {
  const idents = [];
  rootNode.walkAtRules("function", (rule) => {
    const nameMatch = rule.params.match(IDENTIFIER_REGEX);
    if (!nameMatch) {
      throw new Error("Found function with no identifier");
    }
    const name = nameMatch[0].trim();
    idents.push({ id: name, path });
  });
  return idents;
}

function gatherUsedFunctions(rootNode, path) {
  const idents = [];
  visitSassExpressions(rootNode, (expr) => {
    const functionCalls = expr.match(/[a-zA-Z0-9-]+\(/g);
    if (!functionCalls) {
      return;
    }
    functionCalls.forEach((call) => {
      const funcName = call.slice(0, call.length - 1);
      idents.push({ id: funcName, path });
    });
  });
  return idents;
}

/**
 * Find unused variables and mixins in a set of SASS files.
 *
 * @param {Array<string>} srcFiles - List of source file paths
 * @param {Function} resolver - Optional. Function that takes a path and returns
 *                   its SASS content. If not specified, `fs.readFileSync` is used.
 */
function findUnused(srcFiles, resolver) {
  const declaredVars = [];
  const usedVars = [];

  const declaredMixins = [];
  const usedMixins = [];

  const declaredFunctions = [];
  const usedFunctions = [];

  srcFiles.forEach((path) => {
    const src = resolver ? resolver(path) : fs.readFileSync(path).toString();
    const rootNode = postCssScss.parse(src);

    declaredVars.push(...gatherDeclaredVars(rootNode, path));
    gatherUsedVars(rootNode, path).forEach((ident) => {
        usedVars.push({ id: ident, path });
    });

    declaredMixins.push(...gatherDeclaredMixins(rootNode, path));
    gatherUsedMixins(rootNode, path).forEach((ident) => usedMixins.push(ident));

    declaredFunctions.push(...gatherDeclaredFunctions(rootNode, path));
    gatherUsedFunctions(rootNode, path).forEach((ident) => usedFunctions.push(ident));
  });

  const unusedVars = declaredVars.filter((ident) => !usedVars.some(v => ident.id == v.id));
  const unusedMixins = declaredMixins.filter((ident) => !usedMixins.some(v => ident.id == v.id));
  const unusedFunctions = declaredFunctions.filter(
    (ident) => !usedFunctions.some(v => ident.id == v.id)
  );

  return {
    vars: unusedVars,
    mixins: unusedMixins,
    functions: unusedFunctions,
  };
}

module.exports = findUnused;
