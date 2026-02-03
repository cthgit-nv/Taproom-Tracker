import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Beer, Delete, Lock, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@shared/schema";

type LoginStep = "userId" | "pin";

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>("userId");
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  // Step 1: Verify userId
  const verifyUserIdMutation = useMutation({
    mutationFn: async (userIdValue: string) => {
      try {
        const response = await apiRequest("POST", "/api/auth/verify-user-id", { userId: userIdValue });
        return response.json();
      } catch (err: any) {
        // Parse error message from response
        let errorMessage = "Invalid user ID. Please try again.";
        if (err?.message) {
          try {
            const match = err.message.match(/\d+:\s*(.+)/);
            if (match) {
              const errorText = match[1];
              try {
                const errorObj = JSON.parse(errorText);
                errorMessage = errorObj.error || errorMessage;
              } catch {
                errorMessage = errorText;
              }
            }
          } catch {
            // Use default message
          }
        }
        throw new Error(errorMessage);
      }
    },
    onSuccess: () => {
      setStep("pin");
      setError(false);
      setErrorMessage("");
    },
    onError: (err: any) => {
      setError(true);
      const message = err?.message || "Invalid user ID. Please try again.";
      setErrorMessage(message);
      setUserId("");
      setTimeout(() => {
        setError(false);
        setErrorMessage("");
      }, 2500);
    },
  });

  // Step 2: Login with userId + PIN
  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      try {
        const response = await apiRequest("POST", "/api/auth/login", { 
          userId: userId,
          pin: pinCode 
        });
        return response.json();
      } catch (err: any) {
        // Parse error message from response
        let errorMessage = "Invalid credentials. Please try again.";
        if (err?.message) {
          try {
            const match = err.message.match(/\d+:\s*(.+)/);
            if (match) {
              const errorText = match[1];
              try {
                const errorObj = JSON.parse(errorText);
                errorMessage = errorObj.error || errorMessage;
              } catch {
                errorMessage = errorText;
              }
            }
          } catch {
            // Use default message
          }
        }
        throw new Error(errorMessage);
      }
    },
    onSuccess: (data: { user: User }) => {
      login(data.user);
      setTimeout(() => {
        setLocation("/dashboard");
      }, 100);
    },
    onError: (err: any) => {
      setError(true);
      const message = err?.message || "Invalid credentials. Please try again.";
      setErrorMessage(message);
      setPin("");
      setTimeout(() => {
        setError(false);
        setErrorMessage("");
      }, 2500);
    },
  });

  // Auto-submit when userId is complete (step 1)
  useEffect(() => {
    if (step === "userId" && userId.length === 6 && !verifyUserIdMutation.isPending && !error) {
      verifyUserIdMutation.mutate(userId);
    }
  }, [userId, step, verifyUserIdMutation.isPending, error]);

  // Auto-submit when PIN is complete (step 2)
  useEffect(() => {
    if (step === "pin" && pin.length === 4 && !loginMutation.isPending && !error) {
      loginMutation.mutate(pin);
    }
  }, [pin, step, loginMutation.isPending, error]);

  const handleKeyPress = useCallback((digit: string) => {
    if (step === "userId") {
      if (userId.length < 6 && !verifyUserIdMutation.isPending) {
        setUserId((prev) => prev + digit);
      }
    } else {
      if (pin.length < 4 && !loginMutation.isPending) {
        setPin((prev) => prev + digit);
      }
    }
  }, [step, userId.length, pin.length, verifyUserIdMutation.isPending, loginMutation.isPending]);

  const handleDelete = useCallback(() => {
    if (step === "userId") {
      if (!verifyUserIdMutation.isPending) {
        setUserId((prev) => prev.slice(0, -1));
      }
    } else {
      if (!loginMutation.isPending) {
        setPin((prev) => prev.slice(0, -1));
      }
    }
  }, [step, verifyUserIdMutation.isPending, loginMutation.isPending]);

  const handleClear = useCallback(() => {
    if (step === "userId") {
      if (!verifyUserIdMutation.isPending) {
        setUserId("");
      }
    } else {
      if (!loginMutation.isPending) {
        setPin("");
      }
    }
  }, [step, verifyUserIdMutation.isPending, loginMutation.isPending]);

  const handleBack = useCallback(() => {
    if (step === "pin") {
      setStep("userId");
      setPin("");
      setError(false);
      setErrorMessage("");
    }
  }, [step]);

  const isPending = step === "userId" ? verifyUserIdMutation.isPending : loginMutation.isPending;
  const currentInput = step === "userId" ? userId : pin;
  const maxLength = step === "userId" ? 6 : 4;
  const inputDots = step === "userId" ? 6 : 4;

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

      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-3">
        {step === "userId" ? (
          <>
            <User className="w-4 h-4 text-white/40 mr-2" />
            <span className="text-sm text-white/60 font-medium">Enter Birthdate (MMDDYY)</span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4 text-white/40 mr-2" />
            <span className="text-sm text-white/60 font-medium">Enter PIN</span>
          </>
        )}
      </div>
      
      {/* Input Indicator Dots */}
      <div 
        className={`flex gap-4 mb-10 ${error ? "animate-shake" : ""}`}
        data-testid={`${step}-dots-container`}
      >
        {Array.from({ length: inputDots }).map((_, index) => (
          <div
            key={index}
            data-testid={`${step}-dot-${index}`}
            className={`
              w-14 h-14 rounded-full border-2 transition-all duration-200 flex items-center justify-center
              ${
                index < currentInput.length
                  ? "bg-[#D4AF37] border-[#D4AF37]"
                  : index === currentInput.length
                  ? "border-[#D4AF37] bg-transparent animate-pulse-gold"
                  : "border-[#1A4D2E] bg-transparent"
              }
            `}
          >
            {index < currentInput.length && (
              <div className="w-4 h-4 rounded-full bg-[#051a11]" />
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {(error || errorMessage) && (
        <p className="text-red-400 text-sm mb-4 font-medium text-center max-w-xs" data-testid="text-error">
          {errorMessage}
        </p>
      )}

      {/* Loading State */}
      {isPending && (
        <p className="text-[#D4AF37] text-sm mb-4 font-medium animate-pulse" data-testid="text-loading">
          {step === "userId" ? "Verifying..." : "Logging in..."}
        </p>
      )}

      {/* Back Button (only on PIN step) */}
      {step === "pin" && (
        <button
          onClick={handleBack}
          disabled={isPending}
          className="
            mb-4 px-4 py-2 rounded-lg bg-[#0a2419] border-2 border-[#1A4D2E]
            text-sm font-medium text-white/60
            active:bg-[#1A4D2E] active:text-white
            transition-all duration-100
            disabled:opacity-30 disabled:cursor-not-allowed
          "
        >
          ← Back
        </button>
      )}

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() => handleKeyPress(digit)}
            disabled={isPending || currentInput.length >= maxLength}
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
          disabled={isPending || currentInput.length === 0}
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
          disabled={isPending || currentInput.length >= maxLength}
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
          disabled={isPending || currentInput.length === 0}
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
        {step === "userId" 
          ? "Enter your birthdate in MMDDYY format"
          : "Contact manager if you forgot your PIN"
        }
      </p>
    </div>
  );
}
