#!/usr/bin/env node

import fs from "fs";
import path from "path";
import * as acorn from "acorn";
import { exit } from "process";

// ---- Argument Parsing ----

const [, , inputPath, outputPath, noPrettier] = process.argv;

let prettier: any = null;

if (!noPrettier) {
  try {
    prettier = await import("prettier");
  } catch {
    console.error("Prettier not found. Install it for better output formatting.");
    process.exit(1);
  }
}

if (!inputPath || !outputPath) {
  console.error("Usage: typescriptify <input.js> <output.ts>");
  process.exit(1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

if (!fs.existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`);
  process.exit(1);
}

const code = fs.readFileSync(resolvedInput, "utf8");

const ast = acorn.parse(code, {
  ecmaVersion: "latest",
  sourceType: "module",
  locations: true
}) as any;

// ---- Type Inference ----

type TSPrimitive = "number" | "string" | "boolean" | "null" | "any";

function inferLiteralType(node: any): TSPrimitive {
  if (!node) return "any";

  if (node.type === "Literal") {
    const val = node.value;
    if (typeof val === "number") return "number";
    if (typeof val === "string") return "string";
    if (typeof val === "boolean") return "boolean";
    if (val === null) return "null";
  }

  return "any";
}

function inferExpressionType(node: any): string {
  if (!node) return "any";

  switch (node.type) {
    case "Literal":
      return inferLiteralType(node);

    case "ArrayExpression":
      if (node.elements.length === 0) return "any[]";
      const firstType = inferExpressionType(node.elements[0]);
      return `${firstType}[]`;

    case "ObjectExpression":
      const props = node.properties.map((p: any) => {
        const key = p.key.name || p.key.value;
        const valType = inferExpressionType(p.value);
        return `${key}: ${valType}`;
      });
      return `{ ${props.join("; ")} }`;

    case "BinaryExpression":
      if (["+", "-", "*", "/", "%"].includes(node.operator))
        return "number";
      return "any";

    case "CallExpression":
      return "any";

    default:
      return "any";
  }
}

// ---- Collection ----

interface VariableInfo {
  name: string;
  kind: string;
  type: string;
  value?: any;
}

interface FunctionInfo {
  name: string;
  parameters: { name: string; type: string }[];
  contentRange: [number, number];
  returnType: string;
}

const variables = new Map<string, VariableInfo>();
const functions: FunctionInfo[] = [];

function traverse(node: any) {
  if (!node || typeof node !== "object") return;

  // Variable Declarations
  if (node.type === "VariableDeclaration") {
    for (const declarator of node.declarations) {
      if (declarator.id.type === "Identifier") {
        const name = declarator.id.name;
        const inferredType = inferExpressionType(declarator.init);

        if (!variables.has(name)) {
          variables.set(name, {
            name,
            kind: node.kind,
            value: declarator.init?.raw ?? undefined,
            type: inferredType
          });
        }
      }
    }
  }

  // Function Declarations
  if (node.type === "FunctionDeclaration") {
    const name = node.id?.name || "anonymous";

    const params = node.params.map((param: any) => ({
      name: param.name,
      type: "any"
    }));

    let returnType = "void";

    node.body.body.forEach((stmt: any) => {
      if (stmt.type === "ReturnStatement") {
        returnType = inferExpressionType(stmt.argument);
      }
    });

    functions.push({
      name,
      parameters: params,
      contentRange: [node.body.body[0].start, node.body.body[node.body.body.length - 1].end],
      returnType
    });
  }

  for (const key in node) {
    if (key === "loc" || key === "range") continue;
    const child = node[key];

    if (Array.isArray(child)) {
      child.forEach(traverse);
    } else if (child && typeof child === "object") {
      traverse(child);
    }
  }
}

traverse(ast);

// ---- Generate TypeScript ----

let output = `// Auto-generated TypeScript from ${path.basename(resolvedInput)}\n\n`;

// Variables
variables.forEach(v => {
  output += `${v.kind} ${v.name}: ${v.type} ${v.value ? `= ${v.value}` : ''};\n`;
});

output += `\n`;

// Functions
functions.forEach(fn => {
  const params = fn.parameters
    .map(p => `${p.name}: ${p.type}`)
    .join(", ");

  output += `function ${fn.name}(${params}): ${fn.returnType} {${code.slice(fn.contentRange[0], fn.contentRange[1])}}`;
});

if (prettier) {
  output = await prettier.format(output, { parser: "typescript" });
}

fs.writeFileSync(resolvedOutput, output, "utf8");

console.log(`TypeScript file written to ${resolvedOutput}`);
console.log(`Found ${variables.size} variables and ${functions.length} functions`); 