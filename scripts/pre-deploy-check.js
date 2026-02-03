#!/usr/bin/env node

/**
 * Pre-deployment validation script
 * Validates build output, environment variables, and deployment readiness
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const errors = [];
const warnings = [];

console.log("🔍 Running pre-deployment checks...\n");

// Check 1: Verify build output exists
console.log("1. Checking build output...");
const distPath = path.resolve(projectRoot, "dist");
const distIndexPath = path.resolve(distPath, "index.cjs");
const distPublicPath = path.resolve(distPath, "public");
const distIndexHtmlPath = path.resolve(distPublicPath, "index.html");

if (!fs.existsSync(distPath)) {
  errors.push("dist/ directory does not exist. Run 'npm run build' first.");
} else {
  console.log("   ✓ dist/ directory exists");
}

if (!fs.existsSync(distIndexPath)) {
  errors.push("dist/index.cjs does not exist. Server build failed.");
} else {
  console.log("   ✓ dist/index.cjs exists");
  const stats = fs.statSync(distIndexPath);
  if (stats.size < 1000) {
    warnings.push("dist/index.cjs is suspiciously small. Build may be incomplete.");
  }
}

if (!fs.existsSync(distPublicPath)) {
  errors.push("dist/public/ directory does not exist. Client build failed.");
} else {
  console.log("   ✓ dist/public/ directory exists");
}

if (!fs.existsSync(distIndexHtmlPath)) {
  errors.push("dist/public/index.html does not exist. Client build incomplete.");
} else {
  console.log("   ✓ dist/public/index.html exists");
}

// Check 2: Verify required files exist
console.log("\n2. Checking required files...");
const requiredFiles = [
  "package.json",
  "railway.json",
  "server/index.ts",
  "server/static.ts",
  "script/build.ts",
];

for (const file of requiredFiles) {
  const filePath = path.resolve(projectRoot, file);
  if (!fs.existsSync(filePath)) {
    errors.push(`Required file missing: ${file}`);
  } else {
    console.log(`   ✓ ${file} exists`);
  }
}

// Check 3: Verify package.json scripts
console.log("\n3. Checking package.json scripts...");
const packageJson = JSON.parse(fs.readFileSync(path.resolve(projectRoot, "package.json"), "utf-8"));
const requiredScripts = ["build", "start"];

for (const script of requiredScripts) {
  if (!packageJson.scripts || !packageJson.scripts[script]) {
    errors.push(`Required script missing in package.json: ${script}`);
  } else {
    console.log(`   ✓ Script '${script}' exists: ${packageJson.scripts[script]}`);
  }
}

// Check 4: Verify railway.json configuration
console.log("\n4. Checking railway.json configuration...");
const railwayJsonPath = path.resolve(projectRoot, "railway.json");
if (fs.existsSync(railwayJsonPath)) {
  const railwayJson = JSON.parse(fs.readFileSync(railwayJsonPath, "utf-8"));
  
  if (!railwayJson.build || railwayJson.build.builder !== "NIXPACKS") {
    warnings.push("railway.json should use NIXPACKS builder");
  } else {
    console.log(`   ✓ Builder: ${railwayJson.build.builder}`);
  }
  
  if (!railwayJson.deploy || !railwayJson.deploy.startCommand) {
    errors.push("railway.json missing startCommand");
  } else {
    console.log(`   ✓ Start command: ${railwayJson.deploy.startCommand}`);
  }
} else {
  errors.push("railway.json not found (required for Railway deployment)");
}

// Check 4.5: Verify nixpacks.toml configuration
console.log("\n4.5. Checking nixpacks.toml configuration...");
const nixpacksTomlPath = path.resolve(projectRoot, "nixpacks.toml");
if (fs.existsSync(nixpacksTomlPath)) {
  const nixpacksContent = fs.readFileSync(nixpacksTomlPath, "utf-8");
  
  // Check for Node.js 20 reference
  if (!nixpacksContent.includes("nodejs-20_x")) {
    warnings.push("nixpacks.toml may not reference Node.js 20");
  } else {
    console.log("   ✓ Node.js 20 referenced in nixpacks.toml");
  }
  
  // Check for npm reference
  if (!nixpacksContent.includes("npm")) {
    warnings.push("nixpacks.toml missing npm package");
  } else {
    console.log("   ✓ npm package referenced in nixpacks.toml");
  }
  
  // Check for build phase
  if (!nixpacksContent.includes("[phases.build]")) {
    warnings.push("nixpacks.toml missing build phase");
  } else {
    console.log("   ✓ Build phase configured");
  }
} else {
  errors.push("nixpacks.toml not found (required for Railway Nixpacks builds)");
}

// Check 4.6: Check for stale .nixpacks directory
console.log("\n4.6. Checking for stale Nixpacks artifacts...");
const nixpacksDir = path.resolve(projectRoot, ".nixpacks");
if (fs.existsSync(nixpacksDir)) {
  warnings.push(".nixpacks directory exists (should be gitignored, may contain stale files)");
  const nixFiles = fs.readdirSync(nixpacksDir).filter(f => f.endsWith(".nix"));
  if (nixFiles.length > 0) {
    warnings.push(`Found ${nixFiles.length} .nix files in .nixpacks (these are auto-generated and may be outdated)`);
  }
} else {
  console.log("   ✓ No stale .nixpacks directory");
}

// Check 5: Environment variable documentation
console.log("\n5. Checking environment variable requirements...");
const envVars = {
  required: ["DATABASE_URL"],
  requiredProduction: ["SESSION_SECRET", "DATABASE_URL"],
  optional: ["GOTAB_API_KEY", "GOTAB_API_SECRET", "GOTAB_LOCATION_UUID", "UNTAPPD_EMAIL", "UNTAPPD_API_TOKEN", "UNTAPPD_LOCATION_ID", "BARCODESPIDER_API_TOKEN"],
};

console.log("   Required (always):", envVars.required.join(", "));
console.log("   Required (production):", envVars.requiredProduction.join(", "));
console.log("   Optional:", envVars.optional.join(", "));

// Check 6: Verify static file structure
console.log("\n6. Checking static file structure...");
if (fs.existsSync(distPublicPath)) {
  const publicFiles = fs.readdirSync(distPublicPath);
  const hasJsFiles = publicFiles.some(f => f.endsWith(".js") || f.endsWith(".mjs"));
  const hasCssFiles = publicFiles.some(f => f.endsWith(".css"));
  
  if (!hasJsFiles) {
    warnings.push("No JavaScript files found in dist/public/. Client build may be incomplete.");
  } else {
    console.log("   ✓ JavaScript files found");
  }
  
  if (!hasCssFiles) {
    warnings.push("No CSS files found in dist/public/. Styles may be missing.");
  } else {
    console.log("   ✓ CSS files found");
  }
  
  console.log(`   ✓ Found ${publicFiles.length} files in dist/public/`);
}

// Summary
console.log("\n" + "=".repeat(50));
console.log("Pre-deployment Check Summary");
console.log("=".repeat(50));

if (warnings.length > 0) {
  console.log(`\n⚠️  Warnings (${warnings.length}):`);
  warnings.forEach(warning => console.log(`   - ${warning}`));
}

if (errors.length > 0) {
  console.log(`\n❌ Errors (${errors.length}):`);
  errors.forEach(error => console.log(`   - ${error}`));
  console.log("\n❌ Pre-deployment checks FAILED. Fix errors before deploying.");
  process.exit(1);
} else {
  console.log("\n✅ All pre-deployment checks passed!");
  if (warnings.length > 0) {
    console.log("   (Some warnings were found, but deployment can proceed)");
  }
  process.exit(0);
}
