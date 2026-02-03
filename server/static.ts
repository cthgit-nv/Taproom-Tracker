import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Resolve path relative to the project root
  // The bundled file is at dist/index.cjs, and static files are at dist/public
  // We use process.cwd() which will be the project root in Railway
  // This is more reliable than __dirname which may not work correctly in bundled code
  const distPath = path.resolve(process.cwd(), "dist", "public");
  
  if (!fs.existsSync(distPath)) {
    // Provide helpful error message with debugging info
    const cwd = process.cwd();
    const distExists = fs.existsSync(path.resolve(cwd, "dist"));
    const publicExists = distExists && fs.existsSync(path.resolve(cwd, "dist", "public"));
    
    let errorMsg = `Could not find the build directory: ${distPath}\n`;
    errorMsg += `Current working directory: ${cwd}\n`;
    errorMsg += `dist/ exists: ${distExists}\n`;
    errorMsg += `dist/public/ exists: ${publicExists}\n`;
    errorMsg += `Make sure to run 'npm run build' before starting the server.`;
    
    throw new Error(errorMsg);
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
