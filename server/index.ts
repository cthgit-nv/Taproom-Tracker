import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Environment variable validation
function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required in production
  if (process.env.NODE_ENV === "production") {
    if (!process.env.SESSION_SECRET) {
      errors.push("SESSION_SECRET is required in production");
    }
    if (!process.env.DATABASE_URL) {
      errors.push("DATABASE_URL is required in production");
    }
  }

  // Required always
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL must be set");
  }

  // Optional but recommended
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== "development") {
    warnings.push("SESSION_SECRET not set - using default (not secure for production)");
  }

  // Log configuration status (without exposing secrets)
  const configStatus = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || "5000",
    DATABASE_URL: process.env.DATABASE_URL ? "✓ Set" : "✗ Missing",
    SESSION_SECRET: process.env.SESSION_SECRET ? "✓ Set" : "✗ Missing",
    GOTAB_API_KEY: process.env.GOTAB_API_KEY ? "✓ Set" : "○ Not set",
    UNTAPPD_API_TOKEN: process.env.UNTAPPD_API_TOKEN ? "✓ Set" : "○ Not set",
    BARCODESPIDER_API_TOKEN: process.env.BARCODESPIDER_API_TOKEN ? "✓ Set" : "○ Not set",
  };

  console.log("Environment Configuration:");
  console.log(JSON.stringify(configStatus, null, 2));

  if (warnings.length > 0) {
    warnings.forEach(warning => console.warn("⚠️  WARNING:", warning));
  }

  if (errors.length > 0) {
    console.error("❌ Environment validation failed:");
    errors.forEach(error => console.error("  -", error));
    throw new Error(`Environment validation failed: ${errors.join(", ")}`);
  }

  console.log("✓ Environment validation passed");
}

// Health check endpoint for Railway monitoring
app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Content Security Policy
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self';"
    );
  }
  // Permissions policy
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate environment before starting
  validateEnvironment();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    
    // Don't leak error details in production
    const message = process.env.NODE_ENV === "production" && status === 500
      ? "Internal Server Error"
      : (err.message || "Internal Server Error");

    // Log full error details server-side
    if (status >= 500) {
      console.error("Server error:", err);
    }

    res.status(status).json({ message });
    
    // Only throw in development to see stack traces
    if (process.env.NODE_ENV !== "production") {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
