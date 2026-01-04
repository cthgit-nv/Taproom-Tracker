import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Beer, Delete, Lock } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@shared/schema";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", { pin: pinCode });
      return response.json();
    },
    onSuccess: (data: { user: User }) => {
      login(data.user);
      // Use setTimeout to ensure state is updated before navigation
      setTimeout(() => {
        setLocation("/dashboard");
      }, 100);
    },
    onError: () => {
      setError(true);
      setErrorMessage("Invalid PIN. Please try again.");
      setPin("");
      // Reset error state after animation completes (keep error visible longer)
      setTimeout(() => {
        setError(false);
        setErrorMessage("");
      }, 2500);
    },
  });

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (pin.length === 4 && !loginMutation.isPending && !error) {
      loginMutation.mutate(pin);
    }
  }, [pin, loginMutation.isPending, error]);

  const handleKeyPress = useCallback((digit: string) => {
    if (pin.length < 4 && !loginMutation.isPending) {
      setPin((prev) => prev + digit);
    }
  }, [pin.length, loginMutation.isPending]);

  const handleDelete = useCallback(() => {
    if (!loginMutation.isPending) {
      setPin((prev) => prev.slice(0, -1));
    }
  }, [loginMutation.isPending]);

  const handleClear = useCallback(() => {
    if (!loginMutation.isPending) {
      setPin("");
    }
  }, [loginMutation.isPending]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[#051a11]">
      {/* Logo and Title */}
      <div className="flex flex-col items-center mb-12">
        <div className="w-20 h-20 rounded-full bg-[#1A4D2E] flex items-center justify-center mb-4 border-2 border-[#D4AF37]">
          <Beer className="w-10 h-10 text-[#D4AF37]" />
        </div>
        <h1 className="text-2xl font-bold text-[#D4AF37] tracking-tight">
          Well Stocked
        </h1>
        <p className="text-sm text-white/60 mt-1">Taproom Inventory</p>
      </div>

      {/* PIN Indicator Dots */}
      <div className="flex items-center gap-1 mb-3">
        <Lock className="w-4 h-4 text-white/40 mr-2" />
        <span className="text-sm text-white/60 font-medium">Enter PIN</span>
      </div>
      
      <div 
        className={`flex gap-4 mb-10 ${error ? "animate-shake" : ""}`}
        data-testid="pin-dots-container"
      >
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            data-testid={`pin-dot-${index}`}
            className={`
              w-14 h-14 rounded-full border-2 transition-all duration-200 flex items-center justify-center
              ${
                index < pin.length
                  ? "bg-[#D4AF37] border-[#D4AF37]"
                  : index === pin.length
                  ? "border-[#D4AF37] bg-transparent animate-pulse-gold"
                  : "border-[#1A4D2E] bg-transparent"
              }
            `}
          >
            {index < pin.length && (
              <div className="w-4 h-4 rounded-full bg-[#051a11]" />
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {(error || errorMessage) && (
        <p className="text-red-400 text-sm mb-4 font-medium" data-testid="text-error">
          {errorMessage || "Invalid PIN. Please try again."}
        </p>
      )}

      {/* Loading State */}
      {loginMutation.isPending && (
        <p className="text-[#D4AF37] text-sm mb-4 font-medium animate-pulse" data-testid="text-loading">
          Verifying...
        </p>
      )}

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() => handleKeyPress(digit)}
            disabled={loginMutation.isPending || pin.length >= 4}
            data-testid={`button-key-${digit}`}
            className="
              h-16 rounded-lg bg-[#0a2419] border-2 border-[#1A4D2E]
              text-2xl font-semibold text-white
              active:bg-[#1A4D2E] active:border-[#D4AF37]
              transition-all duration-100
              disabled:opacity-50 disabled:cursor-not-allowed
              touch-target
            "
          >
            {digit}
          </button>
        ))}
        
        {/* Clear button */}
        <button
          onClick={handleClear}
          disabled={loginMutation.isPending || pin.length === 0}
          data-testid="button-clear"
          className="
            h-16 rounded-lg bg-[#0a2419] border-2 border-[#1A4D2E]
            text-sm font-medium text-white/60
            active:bg-[#1A4D2E] active:text-white
            transition-all duration-100
            disabled:opacity-30 disabled:cursor-not-allowed
            touch-target
          "
        >
          Clear
        </button>
        
        {/* Zero button */}
        <button
          onClick={() => handleKeyPress("0")}
          disabled={loginMutation.isPending || pin.length >= 4}
          data-testid="button-key-0"
          className="
            h-16 rounded-lg bg-[#0a2419] border-2 border-[#1A4D2E]
            text-2xl font-semibold text-white
            active:bg-[#1A4D2E] active:border-[#D4AF37]
            transition-all duration-100
            disabled:opacity-50 disabled:cursor-not-allowed
            touch-target
          "
        >
          0
        </button>
        
        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={loginMutation.isPending || pin.length === 0}
          data-testid="button-delete"
          className="
            h-16 rounded-lg bg-[#0a2419] border-2 border-[#1A4D2E]
            text-white/60 flex items-center justify-center
            active:bg-[#1A4D2E] active:text-white
            transition-all duration-100
            disabled:opacity-30 disabled:cursor-not-allowed
            touch-target
          "
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      {/* Footer hint */}
      <p className="text-xs text-white/30 mt-8 text-center">
        Contact manager if you forgot your PIN
      </p>
    </div>
  );
}
