#!/usr/bin/env node

import fs from "fs";
import path from "path";
import * as acorn from "acorn";

// ---- Argument Parsing ----

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: typescriptify <input.js> <output.json>");
  process.exit(1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

// ---- Read Input ----

if (!fs.existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`);
  process.exit(1);
}

const code = fs.readFileSync(resolvedInput, "utf8");

// ---- Parse to AST ----

const ast = acorn.parse(code, {
  ecmaVersion: "latest",
  sourceType: "module",
  locations: true
});

// ---- Write Output ----

fs.writeFileSync(
  resolvedOutput,
  JSON.stringify(ast, null, 2),
  "utf8"
);

console.log(`AST written to ${resolvedOutput}`);