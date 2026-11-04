"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { Input } from "./form-controls";

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  showLabel: string;
  hideLabel: string;
};

/** A password field whose text can be shown, to catch a mistyped password before it is sent. */
export function PasswordInput({ showLabel, hideLabel, className, ...props }: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <Input
        {...props}
        type={shown ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="none"
        className={cn("pr-13", className)}
      />
      <button
        type="button"
        aria-pressed={shown}
        onClick={() => setShown((value) => !value)}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "absolute top-1/2 right-1.5 size-9 -translate-y-1/2 hover:-translate-y-1/2 active:-translate-y-1/2",
        )}
      >
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        {/* A name, not aria-label: the field's own label stays the only thing called "Password". */}
        <span className="sr-only">{shown ? hideLabel : showLabel}</span>
      </button>
    </span>
  );
}
